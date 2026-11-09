import Foundation

/**
 * @class IdentityTokens
 * @description An access/refresh token pair, as the server hands it over
 */
struct IdentityTokens: Codable {
    var accessToken: String /*!< The short-lived token sent with every request */
    var refreshToken: String /*!< The long-lived token renewing it */
}

/**
 * @class RemoteState
 * @description The budget document as the server stores it, with its revision: a counter every write moves on
 */
struct RemoteState: Decodable {
    var document: BudgetDocument /*!< The budget */
    var revision: Int /*!< Its revision */

    /**
     * @type CodingKeys
     * @description The key the revision sits under, next to the document's own
     */
    private enum CodingKeys: String, CodingKey {
        case revision /*!< The revision */
    }

    /**
     * @constructor init
     * @description Reads the document and its revision from the same object
     *
     * @param decoder The decoder
     */
    init(from decoder: Decoder) throws {
        document = try BudgetDocument(from: decoder)
        revision = try decoder.container(keyedBy: CodingKeys.self).decode(Int.self, forKey: .revision)
    }
}

/**
 * @class TrashedOperation
 * @description An operation in the trash, with when it was deleted
 */
struct TrashedOperation: Decodable, Identifiable {
    let operation: Operation /*!< The operation */
    let deletedAt: Date /*!< When it was deleted */

    var id: String { operation.id } /*!< Its identifier, the operation's */

    /**
     * @type CodingKeys
     * @description The key the deletion date sits under, next to the operation's own
     */
    private enum CodingKeys: String, CodingKey {
        case deletedAt /*!< When it was deleted */
    }

    /**
     * @constructor init
     * @description Reads the operation and its deletion date from the same object
     *
     * @param decoder The decoder
     */
    init(from decoder: Decoder) throws {
        operation = try Operation(from: decoder)
        deletedAt = try decoder.container(keyedBy: CodingKeys.self).decode(Date.self, forKey: .deletedAt)
    }
}

/**
 * @class OperationFields
 * @description What an operation holds, as the server takes it on creation or change. A missing note or place is
 * written as null rather than left out, since a change leaves out only what stays as it is
 */
private struct OperationFields: Encodable {
    let operation: Operation /*!< The operation */
    let includesId: Bool /*!< Whether to send its id, which only a creation names */

    /**
     * @type CodingKeys
     * @description The fields the server takes
     */
    private enum CodingKeys: String, CodingKey {
        case id /*!< Its identifier */
        case date /*!< When it happened */
        case name /*!< Its name */
        case description /*!< Its note */
        case categoryId /*!< Its category */
        case location /*!< Its place */
        case amount /*!< Its amount */
        case currencyCode /*!< Its currency */
        case rateToEuro /*!< Its rate to the euro */
        case isOnline /*!< Whether it was paid online */
        case isRecurring /*!< Whether it repeats */
    }

    /**
     * @method encode
     * @description Writes the fields, nulls included
     *
     * @param encoder The encoder
     */
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        if includesId {
            try container.encode(operation.id, forKey: .id)
        }
        try container.encode(operation.date, forKey: .date)
        try container.encode(operation.name, forKey: .name)
        try container.encode(operation.description, forKey: .description)
        try container.encode(operation.categoryId, forKey: .categoryId)
        try container.encode(operation.location, forKey: .location)
        try container.encode(operation.amount, forKey: .amount)
        try container.encode(operation.currencyCode, forKey: .currencyCode)
        try container.encode(operation.rateToEuro, forKey: .rateToEuro)
        try container.encode(operation.isOnline, forKey: .isOnline)
        try container.encode(operation.isRecurring, forKey: .isRecurring)
    }
}

/**
 * @class CategoryFields
 * @description What a category holds, with its place in the list, as the server stores it
 */
private struct CategoryFields: Encodable {
    let name: String /*!< Its name */
    let symbol: String /*!< Its symbol */
    let colorHex: UInt32 /*!< Its colour */
    let monthlyLimit: Double /*!< Its monthly limit */
    let position: Int /*!< Its place in the list */
}

/**
 * @class ClientConnection
 * @description An app the owner authorized with the passkey, such as Claude, as the server lists it
 */
struct ClientConnection: Decodable, Identifiable {
    let id: String /*!< The connection's id */
    let name: String /*!< The app's name, as it registered */
    let connectedAt: Date /*!< When it was authorized */
    let lastUsedAt: Date /*!< When it last used its access */
}

/**
 * @type APIError
 * @description Why a request to the server failed, worded for the person in the interface's language
 */
enum APIError: UserFacingError {
    case notConfigured /*!< No server address is set */
    case unauthorized /*!< The session expired and couldn't be renewed */
    case connectionRefused /*!< The portal's one-time code was refused */
    case throttled /*!< Too many requests */
    case conflict /*!< The server already holds what the request creates */
    case notFound /*!< The server doesn't know the entry the request names */
    case server(status: Int, message: String) /*!< The server refused the request, with its status and message */
    case explained(status: Int, reason: String) /*!< The server refused the request and named why, for the app to word it */
    case transport(Error) /*!< The server couldn't be reached */
    case decoding(Error) /*!< The server answered something unexpected */

    /**
     * @method errorDescription
     * @description What to tell the person, in the interface's language. The server words its own messages in English
     * for whoever reads its logs, so they are kept for that and never shown
     */
    var errorDescription: String? {
        switch self {
        case .notConfigured: return String(appLocalized: "No server is configured.")
        case .unauthorized: return String(appLocalized: "Your session has expired.")
        case .connectionRefused: return String(appLocalized: "The sign-in didn't go through. Try again.")
        case .throttled: return String(appLocalized: "Too many attempts. Try again in a moment.")
        case .conflict: return String(appLocalized: "The budget changed on the server.")
        case .notFound: return String(appLocalized: "The server refused the request.")
        case .server(let status, _) where status >= 500: return String(appLocalized: "The server is unavailable right now.")
        case .server: return String(appLocalized: "The server refused the request.")
        case .explained(let status, _) where status >= 500: return String(appLocalized: "The server is unavailable right now.")
        case .explained: return String(appLocalized: "The server refused the request.")
        case .transport: return String(appLocalized: "Can't reach the server.")
        case .decoding: return String(appLocalized: "The server sent an unexpected response.")
        }
    }

    /**
     * @method isOffline
     * @description Whether the server couldn't be reached
     */
    var isOffline: Bool {
        if case .transport = self {
            return true
        }
        return false
    }
}

/**
 * @class APIClient
 * @description Talks to the server: it signs in with the portal's one-time code, renews the tokens when they lapse, and
 * reads and writes the budget and the rates
 */
@MainActor
final class APIClient {
    private(set) var baseURL: URL? /*!< The server's address */
    private let tokens: TokenStore /*!< The session's tokens */
    private let session: URLSession /*!< The URL session the requests go through */
    private var refreshTask: Task<Void, Error>? /*!< The renewal under way, shared by the requests that need it */

    /**
     * @constructor init
     * @description Builds a client around the token store
     *
     * @param tokens The session's tokens
     * @param baseURL The server's address
     */
    init(tokens: TokenStore, baseURL: URL? = nil) {
        self.tokens = tokens
        self.baseURL = baseURL
        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = 20
        configuration.waitsForConnectivity = false
        self.session = URLSession(configuration: configuration)
    }

    /**
     * @method setBaseURL
     * @description Points the client at a server
     *
     * @param url The server's address
     */
    func setBaseURL(_ url: URL?) {
        baseURL = url
    }

    /**
     * @class Envelope
     * @description The `{ data }` envelope every answer comes in
     */
    private struct Envelope<T: Decodable>: Decodable {
        let data: T /*!< The answer */
    }

    /**
     * @class ErrorEnvelope
     * @description The message an error answer carries, and why the server refused when it says
     */
    private struct ErrorEnvelope: Decodable {
        let message: String /*!< The server's message, for its logs */
        let data: ErrorDetails? /*!< What the server adds about the refusal, if anything */
    }

    /**
     * @class ErrorDetails
     * @description What an error answer adds about the refusal
     */
    private struct ErrorDetails: Decodable {
        let reason: String? /*!< Why the server refused, for the app to word it */
    }

    /**
     * @method connect
     * @description Trades the one-time code the portal handed back, with the PKCE verifier it was asked with, for a
     * session
     *
     * @param code The one-time code
     * @param verifier The PKCE verifier
     */
    func connect(code: String, verifier: String) async throws {
        do {
            let tokens: IdentityTokens = try await send(
                "/v1/identity/connect/token",
                method: "POST",
                body: ["code": code, "verifier": verifier],
                authorized: false
            )
            self.tokens.store(access: tokens.accessToken, refresh: tokens.refreshToken)
        } catch APIError.server(status: 401, message: _) {
            throw APIError.connectionRefused
        }
    }

    /**
     * @method logout
     * @description Closes the session on the server; a failure is ignored, the session is forgotten anyway
     */
    func logout() async {
        guard let refreshToken = tokens.refreshToken else {
            return
        }
        let _: EmptyResponse? = try? await send(
            "/v1/identity/logout",
            method: "POST",
            body: ["refreshToken": refreshToken]
        )
    }

    /**
     * @method getRates
     * @description Reads the latest reference rates
     *
     * @returns The rates
     */
    func getRates() async throws -> RateSnapshot {
        try await send("/v1/budget/rates", method: "GET")
    }

    /**
     * @method getRates
     * @description Reads one day's reference rates
     *
     * @param day The day, as `YYYY-MM-DD`
     * @returns The rates
     */
    func getRates(on day: String) async throws -> RateSnapshot {
        try await send("/v1/budget/rates/\(day)", method: "GET")
    }

    /**
     * @method getState
     * @description Reads the whole budget and its revision
     *
     * @returns The budget
     */
    func getState() async throws -> RemoteState {
        try await send("/v1/budget/state", method: "GET")
    }

    /**
     * @method getTrash
     * @description Reads the operations in the trash, the latest deleted first
     *
     * @returns The operations, with when each was deleted
     */
    func getTrash() async throws -> [TrashedOperation] {
        try await send("/v1/budget/operations/trash", method: "GET")
    }

    /**
     * @method restoreOperation
     * @description Takes an operation out of the trash, back into the budget
     *
     * @param id Its id
     */
    func restoreOperation(id: String) async throws {
        try await sendDiscarding(entryPath("operations", id, "restore"), method: "POST")
    }

    /**
     * @method getConnections
     * @description Reads the apps authorized with the passkey that still hold their access, the most recently used first
     *
     * @returns The apps
     */
    func getConnections() async throws -> [ClientConnection] {
        try await send("/v1/oauth/connections", method: "GET")
    }

    /**
     * @method revokeConnection
     * @description Takes an app's access away at once
     *
     * @param id The connection's id
     */
    func revokeConnection(id: String) async throws {
        try await sendDiscarding("/v1/oauth/connections/\(id)", method: "DELETE")
    }

    /**
     * @method write
     * @description Sends one write. Every write can be sent again safely: a creation the server already holds (an
     * earlier send whose answer was lost) becomes a change, a change to an operation in the trash restores it first,
     * so an edit always beats a deletion as in the merge, and deleting what is already gone is a success
     *
     * @param write The write
     */
    func write(_ write: BudgetWrite) async throws {
        switch write {
        case .createOperation(let operation):
            do {
                try await sendDiscarding("/v1/budget/operations", method: "POST", body: OperationFields(operation: operation, includesId: true))
            } catch APIError.conflict {
                try await self.write(.updateOperation(operation))
            }
        case .updateOperation(let operation):
            do {
                try await updateOperation(operation)
            } catch APIError.notFound {
                try await sendDiscarding(entryPath("operations", operation.id, "restore"), method: "POST")
                try await updateOperation(operation)
            }
        case .deleteOperation(let id):
            try await ignoringNotFound { try await sendDiscarding(entryPath("operations", id), method: "DELETE") }
        case .storeCategory(let category, let position):
            let fields = CategoryFields(name: category.name, symbol: category.symbol, colorHex: category.colorHex, monthlyLimit: category.monthlyLimit, position: position)
            try await sendDiscarding(entryPath("categories", category.id), method: "PUT", body: fields)
        case .deleteCategory(let id):
            try await ignoringNotFound { try await sendDiscarding(entryPath("categories", id), method: "DELETE") }
        case .storeSettings(let settings):
            try await sendDiscarding("/v1/budget/settings", method: "PUT", body: settings)
        case .storeMonth(let month, let budget):
            try await sendDiscarding(entryPath("history", month), method: "PUT", body: budget)
        case .deleteMonth(let month):
            try await ignoringNotFound { try await sendDiscarding(entryPath("history", month), method: "DELETE") }
        }
    }

    /**
     * @method updateOperation
     * @description Changes an operation. Throws `APIError.notFound` when it is unknown or in the trash
     *
     * @param operation The operation, as it should now be
     */
    private func updateOperation(_ operation: Operation) async throws {
        try await sendDiscarding(entryPath("operations", operation.id), method: "PATCH", body: OperationFields(operation: operation, includesId: false))
    }

    /**
     * @method ignoringNotFound
     * @description Runs a deletion, counting an entry already gone as deleted
     *
     * @param work The deletion
     */
    private func ignoringNotFound(_ work: () async throws -> Void) async throws {
        do {
            try await work()
        } catch APIError.notFound {
            return
        }
    }

    /**
     * @method entryPath
     * @description The path of one budget entry. Ids are UUIDs or plain names, which the URL takes as they are
     *
     * @param collection The kind of entry
     * @param id Its id
     * @param action A sub-route, if any
     * @returns Its path
     */
    private func entryPath(_ collection: String, _ id: String, _ action: String? = nil) -> String {
        let path = "/v1/budget/\(collection)/\(id)"
        return action.map { "\(path)/\($0)" } ?? path
    }

    /**
     * @class EmptyResponse
     * @description An answer whose content doesn't matter
     */
    private struct EmptyResponse: Decodable {}

    /**
     * @method send
     * @description Sends a request, renewing the tokens once and replaying it when the access token lapsed
     *
     * @param path The path, from `/v1`
     * @param method The HTTP method
     * @param body The body, if any
     * @param authorized Whether to send the access token
     * @returns The answer's data
     */
    private func send<Response: Decodable>(
        _ path: String,
        method: String,
        body: Encodable? = nil,
        authorized: Bool = true
    ) async throws -> Response {
        do {
            return try await perform(path, method: method, body: body, authorized: authorized)
        } catch APIError.unauthorized where authorized {
            try await refreshTokens()
            return try await perform(path, method: method, body: body, authorized: true)
        }
    }

    /**
     * @method sendDiscarding
     * @description Sends a request whose answer doesn't matter, such as a write answered with no content, renewing the
     * tokens once and replaying it when the access token lapsed
     *
     * @param path The path, from `/v1`
     * @param method The HTTP method
     * @param body The body, if any
     */
    private func sendDiscarding(_ path: String, method: String, body: Encodable? = nil) async throws {
        do {
            _ = try await exchange(path, method: method, body: body, authorized: true)
        } catch APIError.unauthorized {
            try await refreshTokens()
            _ = try await exchange(path, method: method, body: body, authorized: true)
        }
    }

    /**
     * @method perform
     * @description Sends one request and reads its answer
     *
     * @param path The path, from `/v1`
     * @param method The HTTP method
     * @param body The body, if any
     * @param authorized Whether to send the access token
     * @returns The answer's data
     */
    private func perform<Response: Decodable>(
        _ path: String,
        method: String,
        body: Encodable?,
        authorized: Bool
    ) async throws -> Response {
        let data = try await exchange(path, method: method, body: body, authorized: authorized)

        do {
            return try JSONCoding.decoder.decode(Envelope<Response>.self, from: data).data
        } catch {
            throw APIError.decoding(error)
        }
    }

    /**
     * @method exchange
     * @description Sends one request and returns the raw answer, turning each refusal into its `APIError`
     *
     * @param path The path, from `/v1`
     * @param method The HTTP method
     * @param body The body, if any
     * @param authorized Whether to send the access token
     * @returns The answer's body
     */
    private func exchange(
        _ path: String,
        method: String,
        body: Encodable?,
        authorized: Bool
    ) async throws -> Data {
        guard let baseURL else {
            throw APIError.notConfigured
        }

        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONCoding.encoder.encode(AnyEncodable(body))
        }

        if authorized, let accessToken = tokens.accessToken {
            request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw APIError.transport(error)
        }

        guard let http = response as? HTTPURLResponse else {
            throw APIError.server(status: 0, message: "Invalid response")
        }

        if http.statusCode == 401, authorized {
            throw APIError.unauthorized
        }

        if http.statusCode == 409 {
            throw APIError.conflict
        }

        if http.statusCode == 404 {
            throw APIError.notFound
        }

        if http.statusCode == 429 {
            throw APIError.throttled
        }

        guard (200..<300).contains(http.statusCode) else {
            let envelope = try? JSONCoding.decoder.decode(ErrorEnvelope.self, from: data)
            if let reason = envelope?.data?.reason {
                throw APIError.explained(status: http.statusCode, reason: reason)
            }
            throw APIError.server(status: http.statusCode, message: envelope?.message ?? "Request failed")
        }

        return data
    }

    /**
     * @method refreshTokens
     * @description Rotates the refresh token into a new pair. Concurrent calls share one rotation, and a refused one
     * ends the session
     */
    private func refreshTokens() async throws {
        if let refreshTask {
            try await refreshTask.value
            return
        }
        let task = Task<Void, Error> {
            defer { refreshTask = nil }
            guard let refreshToken = tokens.refreshToken else {
                throw APIError.unauthorized
            }
            do {
                let pair: IdentityTokens = try await perform(
                    "/v1/identity/refresh",
                    method: "POST",
                    body: ["refreshToken": refreshToken],
                    authorized: false
                )
                tokens.store(access: pair.accessToken, refresh: pair.refreshToken)
            } catch APIError.server, APIError.unauthorized {
                tokens.clear()
                throw APIError.unauthorized
            }
        }
        refreshTask = task
        try await task.value
    }
}

/**
 * @class AnyEncodable
 * @description Wraps any encodable body, so the client can take bodies of every type
 */
private struct AnyEncodable: Encodable {
    private let encode: (Encoder) throws -> Void /*!< Encodes the wrapped body */

    /**
     * @constructor init
     * @description Wraps a body
     *
     * @param wrapped The body
     */
    init(_ wrapped: Encodable) {
        encode = wrapped.encode
    }

    /**
     * @method encode
     * @description Encodes the wrapped body
     *
     * @param encoder The encoder
     */
    func encode(to encoder: Encoder) throws {
        try encode(encoder)
    }
}
