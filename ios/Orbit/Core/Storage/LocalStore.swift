import Foundation
import Observation

/**
 * @type JSONCoding
 * @description The JSON encoder and decoder the app writes the budget with, dates as ISO 8601
 */
enum JSONCoding {
    /**
     * @constant encoder
     * @description Writes JSON with ISO 8601 dates
     */
    static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }()

    /**
     * @constant decoder
     * @description Reads JSON with ISO 8601 dates
     */
    static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()
}

/**
 * @class LocalStore
 * @description The budget's settings kept on the device, as a JSON file in Application Support: the working copy the
 * server syncs with. The operations stay on the server; only the changes to them not yet stored there are kept, in
 * their own file, until the session sends them. Every change is saved at once and announced, so the session can push it
 */
@MainActor
@Observable
final class LocalStore {
    private(set) var categories: [Category] = [] /*!< The spending categories: the shipped catalogue first, then any kept for their operations */
    private(set) var budget: BudgetSettings = .default /*!< The monthly budget */
    private(set) var budgetHistory: [String: MonthlyBudget] = [:] /*!< Each finished month's own budget, by month */
    private(set) var pending: [PendingChange] = [] /*!< The changes to the operations not yet stored on the server, oldest first */
    private(set) var pendingOperations = PendingOperations() /*!< What those changes add up to, for showing them */
    private(set) var revision = 0 /*!< The server's latest known revision, which moves on with every write: the views read the server again when it does */
    private(set) var operationCount = 0 /*!< How many operations the server holds, as it last said */

    @ObservationIgnored var onChange: (() -> Void)? /*!< Called after every local change, to push it */
    @ObservationIgnored private var isApplyingRemote = false /*!< Whether the change comes from the server, which needs no pushing back */

    /**
     * @constructor init
     * @description Reads the budget back, and brings its categories in line with the catalogue
     */
    init() {
        load()
        loadPending()
        migrateOperations()
        let stored = categories
        mergeCatalog()
        if categories != stored {
            save()
        }
    }

    /**
     * @method document
     * @description The whole budget, as the server syncs it
     *
     * @returns The budget
     */
    func document() -> BudgetDocument {
        BudgetDocument(categories: categories, budget: budget, budgetHistory: budgetHistory)
    }

    /**
     * @method applyRemote
     * @description Takes the budget the server holds, without announcing it as a local change
     *
     * @param document The server's budget
     */
    func applyRemote(_ document: BudgetDocument) {
        isApplyingRemote = true
        defer { isApplyingRemote = false }
        categories = document.categories
        budget = document.budget
        budgetHistory = document.budgetHistory
        mergeCatalog()
        persist()
    }

    /**
     * @method applyServer
     * @description Takes what the server last said of its operations: its revision and how many it holds
     *
     * @param revision The revision
     * @param operationCount How many operations it holds
     */
    func applyServer(revision: Int, operationCount: Int) {
        self.revision = revision
        self.operationCount = operationCount
    }

    /**
     * @method category
     * @description A category by its id
     *
     * @param id Its id
     * @returns The category, or nil when there is none
     */
    func category(id: String) -> Category? {
        categories.first { $0.id == id }
    }

    /**
     * @method categoryOrFallback
     * @description A category by its id, or the fallback for an operation whose category is gone
     *
     * @param id Its id
     * @returns The category
     */
    func categoryOrFallback(id: String) -> Category {
        category(id: id) ?? .fallback
    }

    /**
     * @method enqueue
     * @description Keeps a change to the operations until the server takes it, and announces it
     *
     * @param change The change
     */
    func enqueue(_ change: PendingChange) {
        pending.append(change)
        pendingOperations = PendingOperations.folding(pending)
        savePending()
        onChange?()
    }

    /**
     * @method settleFirstPending
     * @description Forgets the oldest change waiting, once the server took it or turned it away for good
     */
    func settleFirstPending() {
        guard !pending.isEmpty else {
            return
        }
        pending.removeFirst()
        pendingOperations = PendingOperations.folding(pending)
        savePending()
    }

    /**
     * @method liveBudget
     * @description The budget as it stands now: the monthly limit and each category's limit
     */
    var liveBudget: MonthlyBudget {
        MonthlyBudget(
            monthlyLimit: budget.monthlyLimit,
            categoryLimits: Dictionary(uniqueKeysWithValues: categories.map { ($0.id, $0.monthlyLimit) })
        )
    }

    /**
     * @method monthlyBudget
     * @description The budget a month is measured against: its own once it is over, the live one otherwise
     *
     * @param month Any day of the month
     * @returns The month's budget
     */
    func monthlyBudget(for month: Date) -> MonthlyBudget {
        budgetHistory[BudgetMath.monthKey(month)] ?? liveBudget
    }

    /**
     * @method setMonthlyBudget
     * @description Stores the budget typed for a month. A past month only changes its own budget; the current month
     * changes the live one, which every month after it starts from
     *
     * @param monthlyLimit The monthly budget, never below zero, nil to keep it
     * @param categoryLimits Each category's limit by category id, never below zero, a missing one keeping it
     * @param month Any day of the month
     * @param now The current date
     */
    func setMonthlyBudget(monthlyLimit: Double?, categoryLimits: [String: Double], for month: Date, now: Date = .now) {
        guard BudgetMath.isPastMonth(month, now: now) else {
            if let monthlyLimit {
                budget.monthlyLimit = max(0, monthlyLimit)
            }
            for index in categories.indices {
                if let limit = categoryLimits[categories[index].id] {
                    categories[index].monthlyLimit = max(0, limit)
                }
            }
            save()
            return
        }
        var stored = monthlyBudget(for: month)
        if let monthlyLimit {
            stored.monthlyLimit = max(0, monthlyLimit)
        }
        stored.categoryLimits.merge(categoryLimits.mapValues { max(0, $0) }) { _, typed in typed }
        budgetHistory[BudgetMath.monthKey(month)] = stored
        save()
    }

    /**
     * @method replaceAll
     * @description Replaces the budget's settings, for the demonstration
     *
     * @param categories The categories
     * @param budget The monthly budget
     */
    func replaceAll(categories: [Category], budget: BudgetSettings) {
        self.categories = categories
        self.budget = budget
        budgetHistory = [:]
        save()
    }

    /**
     * @method clearAll
     * @description Deletes every operation and puts the budget back to its defaults
     */
    func clearAll() {
        categories = Category.defaults
        budget = .default
        budgetHistory = [:]
        save()
        enqueue(.deleteEvery)
    }

    /**
     * @method fileURL
     * @description Where the budget is kept
     */
    private static var fileURL: URL {
        let directory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory.appending(path: "local-store.json")
    }

    /**
     * @method load
     * @description Reads the budget back from its file, migrated from older versions
     */
    private func load() {
        guard let data = try? Data(contentsOf: Self.fileURL),
              let document = try? JSONCoding.decoder.decode(BudgetDocument.self, from: LegacyDocument.migrated(data)) else {
            return
        }
        categories = document.categories
        budget = document.budget
        budgetHistory = document.budgetHistory
    }

    /**
     * @method pendingURL
     * @description Where the changes to the operations not yet stored on the server are kept
     */
    private static var pendingURL: URL {
        fileURL.deletingLastPathComponent().appending(path: "pending-operations.json")
    }

    /**
     * @method loadPending
     * @description Reads back the changes to the operations not yet stored on the server
     */
    private func loadPending() {
        guard let data = try? Data(contentsOf: Self.pendingURL),
              let changes = try? JSONCoding.decoder.decode([PendingChange].self, from: data) else {
            return
        }
        pending = changes
        pendingOperations = PendingOperations.folding(changes)
    }

    /**
     * @method savePending
     * @description Writes the changes to the operations not yet stored on the server
     */
    private func savePending() {
        if let data = try? JSONCoding.encoder.encode(pending) {
            try? data.write(to: Self.pendingURL, options: .atomic)
        }
    }

    /**
     * @method migrateOperations
     * @description Turns the operations an older version of the app kept on the device into changes to send, for those
     * it logged, changed or deleted since its last sync, then writes the budget file without them, so it runs once
     */
    private func migrateOperations() {
        guard let data = try? Data(contentsOf: Self.fileURL), data.range(of: Data("\"operations\"".utf8)) != nil else {
            return
        }
        let changes = LegacyDocument.pendingChanges(local: data, base: SyncBase.storedData())
        if !changes.isEmpty {
            pending += changes
            pendingOperations = PendingOperations.folding(pending)
            savePending()
        }
        persist()
    }

    /**
     * @method save
     * @description Writes the budget and announces the change, unless it came from the server
     */
    func save() {
        persist()
        if !isApplyingRemote {
            onChange?()
        }
    }

    /**
     * @method persist
     * @description Writes the budget to its file
     */
    private func persist() {
        if let data = try? JSONCoding.encoder.encode(document()) {
            try? data.write(to: Self.fileURL, options: .atomic)
        }
    }

    /**
     * @method mergeCatalog
     * @description Brings the categories in line with the shipped catalogue, keeping their stored limits. A category
     * shipped after the budget was stored joins it with no limit, so it does not eat into the limits already dispatched
     */
    private func mergeCatalog() {
        guard !categories.isEmpty else {
            categories = Category.defaults
            return
        }

        let stored = Dictionary(categories.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        let catalogIds = Set(Category.defaults.map(\.id))

        let shipped = Category.defaults.map { category in
            var merged = category
            merged.monthlyLimit = stored[category.id]?.monthlyLimit ?? 0
            return merged
        }

        categories = shipped + categories.filter { !catalogIds.contains($0.id) }
    }
}
