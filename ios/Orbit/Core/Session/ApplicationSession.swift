import Foundation
import Observation

/**
 * @class ApplicationSession
 * @description The session with the server, and the sync of the budget: it signs in through the portal, pushes every
 * local change, sends the changes to the operations kept on the device, and reconciles with what the web interface
 * wrote whenever the app becomes active. The operations and the figures worked out from them are read from the server
 */
@MainActor
@Observable
final class ApplicationSession {
    /**
     * @type IdentityState
     * @description Whether the app is signed in
     */
    enum IdentityState {
        case loading /*!< Reading the stored tokens, at launch */
        case signedOut /*!< Signed out: the sign-in screen shows */
        case signedIn /*!< Signed in: the tabs show */
    }

    /**
     * @type SyncState
     * @description Where the budget stands with the server, as the Settings badge shows it
     */
    enum SyncState: Equatable {
        case idle /*!< In step */
        case syncing /*!< A sync is under way */
        case offline /*!< The server can't be reached; the next sync catches up */
        case error(String) /*!< The server refused the sync, with why */
    }

    private(set) var identityState: IdentityState = .loading /*!< Whether the app is signed in */
    private(set) var syncState: SyncState = .idle /*!< Where the budget stands with the server */
    private(set) var lastSyncedAt: Date? /*!< When the budget was last in step with the server */

    let serverURLString = ApplicationSession.serverURL /*!< The server's address */

    private let store: LocalStore /*!< The budget on the device */
    private let rates: ExchangeRates /*!< The exchange rates */
    private let tokens: TokenStore /*!< The session's tokens */
    private let api: APIClient /*!< The server */

    private var pushTask: Task<Void, Never>? /*!< The push waiting for the edits to settle */
    private var syncTask: Task<Void, Never>? /*!< The sync under way, which the next one waits for */
    private var base: SyncBase? /*!< The last budget both sides agreed on, which the merge measures each side's edits against */
    private var isDemo = false /*!< Whether the app runs the demonstration, which never touches the network */
    private var demoOperations: [Operation] = [] /*!< The demonstration's sample operations, served in place of the server's */

    /**
     * @constructor init
     * @description Builds the session around the app's store, rates, tokens and server client
     *
     * @param store The budget on the device
     * @param rates The exchange rates
     * @param tokens The session's tokens
     * @param api The server
     */
    init(store: LocalStore, rates: ExchangeRates, tokens: TokenStore, api: APIClient) {
        self.store = store
        self.rates = rates
        self.tokens = tokens
        self.api = api
        self.base = SyncBase.load()
        api.setBaseURL(URL(string: serverURLString))
    }

    /**
     * @method bootstrap
     * @description Starts at launch: signed in when tokens are stored, in which case the budget reconciles with the
     * server
     */
    func bootstrap() async {
        guard tokens.hasTokens else {
            identityState = .signedOut
            return
        }
        identityState = .signedIn
        wireLocalChanges()
        refreshRates()
        await reconcile()
    }

    /**
     * @method signIn
     * @description Opens the session with the one-time code the portal handed back, and the PKCE verifier it was asked
     * with, then reconciles the budget
     *
     * @param code The one-time code
     * @param verifier The PKCE verifier
     */
    func signIn(code: String, verifier: String) async throws {
        try await api.connect(code: code, verifier: verifier)

        identityState = .signedIn
        wireLocalChanges()
        refreshRates()
        await reconcile()
    }

    /**
     * @method signOut
     * @description Closes the session on the server and forgets it. The sync base is kept, like the budget on the
     * device: signing back in then merges what was logged offline instead of taking the server's budget over it
     */
    func signOut() async {
        pushTask?.cancel()
        store.onChange = nil
        await api.logout()
        tokens.clear()
        syncState = .idle
        lastSyncedAt = nil
        identityState = .signedOut
    }

    /**
     * @method syncNow
     * @description Pushes the budget at once, from the Settings row
     */
    func syncNow() async {
        guard identityState == .signedIn, !isDemo else {
            return
        }
        await push()
    }

    /**
     * @method catchUp
     * @description Reconciles with the server at once, so the budget holds what the web interface wrote last
     */
    func catchUp() async {
        guard identityState == .signedIn else {
            return
        }
        await reconcile()
    }

    /**
     * @method trash
     * @description Reads the operations in the trash
     *
     * @returns The operations, the latest deleted first
     */
    func trash() async throws -> [TrashedOperation] {
        try await api.getTrash()
    }

    /**
     * @method restore
     * @description Takes an operation out of the trash, then reconciles so it shows in the budget again
     *
     * @param id Its id
     */
    func restore(id: String) async throws {
        try await api.restoreOperation(id: id)
        await reconcile()
    }

    /**
     * @method recurring
     * @description Reads the recurring operations, none in the demo
     *
     * @returns The recurring operations, in the order they were created
     */
    func recurring() async throws -> [RecurringOperation] {
        guard !isDemo else {
            return []
        }
        return try await api.getRecurring()
    }

    /**
     * @method saveRecurring
     * @description Creates a recurring operation, or changes the one named, then reconciles so the occurrences the server
     * logged show in the budget
     *
     * @param id The recurring operation changed, nil for a new one
     * @param fields What it logs and when
     * @returns The stored recurring operation
     */
    func saveRecurring(id: String?, _ fields: RecurringFields) async throws -> RecurringOperation {
        let stored: RecurringOperation
        if let id {
            stored = try await api.updateRecurring(id: id, fields)
        } else {
            var created = fields
            created.id = UUID().uuidString
            stored = try await api.createRecurring(created)
        }
        await reconcile()
        return stored
    }

    /**
     * @method deleteRecurring
     * @description Deletes a recurring operation, then reconciles; its occurrences already logged stay
     *
     * @param id Its id
     */
    func deleteRecurring(id: String) async throws {
        try await api.deleteRecurring(id: id)
        await reconcile()
    }

    /**
     * @method connections
     * @description Reads the apps authorized with the passkey, such as Claude
     *
     * @returns The apps, the most recently used first
     */
    func connections() async throws -> [ClientConnection] {
        try await api.getConnections()
    }

    /**
     * @method revokeConnection
     * @description Takes an app's access away at once
     *
     * @param id The connection's id
     */
    func revokeConnection(id: String) async throws {
        try await api.revokeConnection(id: id)
    }

    /**
     * @method applicationBecameActive
     * @description Catches up with the server whenever the app comes back to the foreground
     */
    func applicationBecameActive() {
        guard identityState == .signedIn, !isDemo else {
            return
        }
        refreshRates()

        Task {
            await reconcile()
        }
    }

    /**
     * @method operations
     * @description Reads a page of the operations matching the filters, the latest first
     *
     * @param query The filters
     * @param offset How many operations to skip
     * @param limit How many operations to read
     * @returns The page, with how many operations match in all
     */
    func operations(_ query: OperationQuery, offset: Int, limit: Int) async throws -> OperationPage {
        #if DEBUG
        if isDemo {
            return DemoFigures.page(demoOperations, query: query, offset: offset, limit: limit)
        }
        #endif
        return try await api.listOperations(query, offset: offset, limit: limit)
    }

    /**
     * @method monthFigures
     * @description Reads what a month spent, worked out by the server
     *
     * @param month Any day of the month
     * @returns The figures
     */
    func monthFigures(_ month: Date) async throws -> MonthFigures {
        #if DEBUG
        if isDemo {
            return DemoFigures.month(demoOperations, month: month)
        }
        #endif
        return try await api.monthFigures(BudgetMath.monthKey(month))
    }

    /**
     * @method analysisFigures
     * @description Reads what the Analysis tab shows, worked out by the server
     *
     * @returns The figures
     */
    func analysisFigures() async throws -> AnalysisFigures {
        #if DEBUG
        if isDemo {
            return DemoFigures.analysis(demoOperations)
        }
        #endif
        return try await api.analysisFigures()
    }

    /**
     * @method suggestions
     * @description Reads what the editors suggest for what is typed: earlier names and cities, and the city of the
     * latest operation in person. Nothing when the server can't be reached
     *
     * @param name The name typed
     * @param city The city typed
     * @returns The suggestions, nil when they couldn't be read
     */
    func suggestions(name: String, city: String) async -> Suggestions? {
        guard !isDemo else {
            return nil
        }
        return try? await api.suggestions(name: name, city: city)
    }

    #if DEBUG
    /**
     * @method enterDemo
     * @description Runs the demonstration: signed in, without ever touching the network
     *
     * @param operations The sample operations, served in place of the server's
     */
    func enterDemo(operations: [Operation]) {
        isDemo = true
        demoOperations = operations
        identityState = .signedIn
    }
    #endif

    /**
     * @method refreshRates
     * @description Re-fetches the exchange rates when they have gone stale
     */
    private func refreshRates() {
        guard !isDemo else {
            return
        }

        Task { [rates] in
            await rates.refreshIfNeeded()
        }
    }

    /**
     * @method wireLocalChanges
     * @description Pushes every local change, once the edits settle
     */
    private func wireLocalChanges() {
        store.onChange = { [weak self] in
            self?.schedulePush()
        }
    }

    /**
     * @method schedulePush
     * @description Waits for the edits to settle before pushing, restarting the wait on every new one
     */
    private func schedulePush() {
        pushTask?.cancel()
        pushTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(0.8))
            guard !Task.isCancelled else {
                return
            }
            await self?.push()
        }
    }

    /**
     * @method push
     * @description Queues a push behind the sync under way
     */
    private func push() async {
        guard !isDemo else {
            return
        }
        await enqueueSync { [weak self] in await self?.performPush() }
    }

    /**
     * @method reconcile
     * @description Queues a reconcile behind the sync under way
     */
    private func reconcile() async {
        guard !isDemo else {
            return
        }
        await enqueueSync { [weak self] in await self?.performReconcile() }
    }

    /**
     * @method enqueueSync
     * @description Runs a sync once the previous one is done, so two never overlap
     *
     * @param work The sync
     */
    private func enqueueSync(_ work: @escaping @MainActor () async -> Void) async {
        let previous = syncTask
        let task = Task { @MainActor in
            await previous?.value
            await work()
        }
        syncTask = task
        await task.value
    }

    /**
     * @method performPush
     * @description Sends the device's edits, unless the budget still matches the base, in which case there is nothing
     * to send
     */
    private func performPush() async {
        if store.pending.isEmpty, let base, DocumentMerge.sameContent(store.document(), base.document) {
            markSynced()
            return
        }

        await performReconcile()
    }

    /**
     * @method performReconcile
     * @description Pulls the server's budget, merges it with the device's against the base, applies the result, then
     * sends the server only the entries it lacks, one write each: no write can replace the whole budget, so what
     * another device wrote to other entries in between is never touched. The changes to the operations kept on the
     * device go after them, in order; the server is then read again, so the views catch up with what it holds
     */
    private func performReconcile() async {
        syncState = .syncing
        do {
            let remote = try await api.getState()
            let merged = resolve(remote)

            if !DocumentMerge.sameContent(merged, store.document()) {
                store.applyRemote(merged)
            }

            let result = store.document()

            for write in DocumentDiff.writes(from: remote.document, to: result) {
                try await api.write(write)
            }

            let hadPending = !store.pending.isEmpty
            let dropped = try await sendPending()
            var latest = remote

            if hadPending {
                latest = try await api.getState()
            }

            store.applyServer(revision: latest.revision, operationCount: latest.operationCount)
            commit(result, revision: remote.revision)

            if dropped > 0 {
                syncState = .error(String(appLocalized: "The server refused an operation logged on this device, which was dropped."))
            }
        } catch {
            fail(error)
        }
    }

    /**
     * @method sendPending
     * @description Sends the changes to the operations kept on the device, oldest first, forgetting each once the server
     * took it. One the server turns away for good, such as a change it finds invalid, is dropped so it can't hold the
     * others back; one that fails otherwise stops the send, to be tried again at the next sync
     *
     * @returns How many changes were dropped
     */
    private func sendPending() async throws -> Int {
        var dropped = 0

        while let change = store.pending.first {
            do {
                try await api.write(change.write)
            } catch let error as APIError where error.isRefusal {
                dropped += 1
            }
            store.settleFirstPending()
        }

        return dropped
    }

    /**
     * @method resolve
     * @description The budget to keep from the server's: merged against the base when there is one, the server's
     * otherwise
     *
     * @param remote The server's budget and revision
     * @returns The budget to keep
     */
    private func resolve(_ remote: RemoteState) -> BudgetDocument {
        guard let base, remote.revision >= base.revision else {
            return remote.document
        }

        return DocumentMerge.merge(base: base.document, local: store.document(), remote: remote.document)
    }

    /**
     * @method commit
     * @description Takes a stored budget as the new base and marks the sync done
     *
     * @param document The budget stored
     * @param revision Its revision
     */
    private func commit(_ document: BudgetDocument, revision: Int) {
        adopt(document, revision: revision)
        markSynced()
    }

    /**
     * @method adopt
     * @description Keeps a budget both sides agree on as the new base
     *
     * @param document The budget
     * @param revision Its revision
     */
    private func adopt(_ document: BudgetDocument, revision: Int) {
        let synced = SyncBase(document: document, revision: revision)
        base = synced
        synced.save()
    }

    /**
     * @method markSynced
     * @description Marks the budget in step with the server
     */
    private func markSynced() {
        syncState = .idle
        lastSyncedAt = .now
    }

    /**
     * @method fail
     * @description Reports a failed sync
     *
     * @param error What went wrong
     */
    private func fail(_ error: Error) {
        if let error = error as? APIError {
            handle(error)
        } else {
            syncState = .error(error.userMessage)
        }
    }

    /**
     * @method handle
     * @description Reports a failed sync the server explained: signed out on an expired session, offline when
     * unreachable
     *
     * @param error What the server answered
     */
    private func handle(_ error: APIError) {
        switch error {
        case .unauthorized:
            Task { await signOut() }
        case .transport:
            syncState = .offline
        default:
            syncState = .error(error.userMessage)
        }
    }

    /**
     * @constant serverURL
     * @description The server's address
     */
    static let serverURL = "https://my-orbit-api.mael-bertocchi.fr"
    /**
     * @constant portalURL
     * @description The Orbit portal, whose connect page the app signs in through with the passkey
     */
    static let portalURL = URL(string: "https://my-orbit.mael-bertocchi.fr")!
}
