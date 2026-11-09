import Foundation
import Security

/**
 * @type Keychain
 * @description Strings kept in the iOS keychain, under the app's own service
 */
enum Keychain {
    /**
     * @constant service
     * @description The service every item is filed under
     */
    private static let service = "fr.mael-bertocchi.obole"

    /**
     * @method set
     * @description Keeps a string, replacing the one already kept under its key
     *
     * @param value The string
     * @param key Its key
     */
    static func set(_ value: String, for key: String) {
        let data = Data(value.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key
        ]
        SecItemDelete(query as CFDictionary)
        var attributes = query
        attributes[kSecValueData as String] = data
        attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        SecItemAdd(attributes as CFDictionary, nil)
    }

    /**
     * @method get
     * @description Reads a string back
     *
     * @param key Its key
     * @returns The string, or nil when none is kept
     */
    static func get(_ key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else {
            return nil
        }
        return String(data: data, encoding: .utf8)
    }

    /**
     * @method remove
     * @description Forgets a string
     *
     * @param key Its key
     */
    static func remove(_ key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key
        ]
        SecItemDelete(query as CFDictionary)
    }
}

/**
 * @class TokenStore
 * @description The session's tokens, kept in the keychain so a relaunch stays signed in
 */
@MainActor
final class TokenStore {
    /**
     * @type Keys
     * @description Where each token is kept
     */
    private enum Keys {
        /**
         * @constant access
         * @description The access token
         */
        static let access = "identity.accessToken"
        /**
         * @constant refresh
         * @description The refresh token
         */
        static let refresh = "identity.refreshToken"
    }

    private(set) var accessToken: String? /*!< The short-lived token sent with every request */
    private(set) var refreshToken: String? /*!< The long-lived token renewing it */

    /**
     * @constructor init
     * @description Reads the tokens back from the keychain
     */
    init() {
        accessToken = Keychain.get(Keys.access)
        refreshToken = Keychain.get(Keys.refresh)
    }

    /**
     * @method hasTokens
     * @description Whether a session is open
     */
    var hasTokens: Bool {
        refreshToken != nil
    }

    /**
     * @method store
     * @description Keeps a fresh pair of tokens
     *
     * @param access The access token
     * @param refresh The refresh token
     */
    func store(access: String, refresh: String) {
        accessToken = access
        refreshToken = refresh
        Keychain.set(access, for: Keys.access)
        Keychain.set(refresh, for: Keys.refresh)
    }

    /**
     * @method clear
     * @description Forgets the tokens, on signing out
     */
    func clear() {
        accessToken = nil
        refreshToken = nil
        Keychain.remove(Keys.access)
        Keychain.remove(Keys.refresh)
    }
}
