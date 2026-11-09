import CryptoKit
import Foundation

/**
 * @class PortalConnection
 * @description One sign-in through the Orbit portal. The passkey belongs to the portal's site, and the app can't use it
 * directly without the Associated Domains capability, which a free developer team doesn't get. So the app opens the
 * portal's connect page in a browser sheet, the owner signs in there with the passkey, and the page hands back a
 * one-time code through the app's scheme. The code is bound to a PKCE challenge: only the app holding the matching
 * verifier can trade it for a session
 */
struct PortalConnection {
    /**
     * @type Failure
     * @description Why a sign-in through the portal can fail on the app's side
     */
    enum Failure: Error {
        case unexpectedAnswer /*!< The portal answered something other than this sign-in's code */
    }

    /**
     * @constant callbackScheme
     * @description The scheme the portal hands the code back through, which the browser sheet waits for
     */
    static let callbackScheme = "obole"

    let verifier: String /*!< The secret the server checks the code against; it never leaves the app until the code is traded */
    let state: String /*!< A random value the portal sends back as is, so the app only takes an answer to the request it made */

    /**
     * @constructor init
     * @description Draws a fresh verifier and state
     */
    init() {
        verifier = Self.randomToken(byteCount: 32)
        state = Self.randomToken(byteCount: 16)
    }

    /**
     * @method challenge
     * @description What the server binds the code to: the verifier's SHA-256, base64url-encoded
     */
    var challenge: String {
        Self.base64URL(Data(SHA256.hash(data: Data(verifier.utf8))))
    }

    /**
     * @method url
     * @description The portal's connect page for this sign-in
     *
     * @param portal The portal's address
     * @returns The page's address, carrying the challenge and the state
     */
    func url(portal: URL) -> URL {
        var components = URLComponents(url: portal.appending(path: "connect"), resolvingAgainstBaseURL: false)
        components?.queryItems = [
            URLQueryItem(name: "challenge", value: challenge),
            URLQueryItem(name: "state", value: state)
        ]
        return components?.url ?? portal
    }

    /**
     * @method code
     * @description The one-time code in the portal's answer, provided it answers this sign-in and not another
     *
     * @param callback The address the portal sent back
     * @returns The code
     */
    func code(from callback: URL) throws -> String {
        let items = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems ?? []

        guard callback.scheme == Self.callbackScheme,
              items.first(where: { $0.name == "state" })?.value == state,
              let code = items.first(where: { $0.name == "code" })?.value,
              !code.isEmpty
        else {
            throw Failure.unexpectedAnswer
        }

        return code
    }

    /**
     * @method randomToken
     * @description A random token, base64url-encoded
     *
     * @param byteCount How many random bytes it holds
     * @returns The token
     */
    private static func randomToken(byteCount: Int) -> String {
        var generator = SystemRandomNumberGenerator()
        let bytes = (0..<byteCount).map { _ in UInt8.random(in: .min ... .max, using: &generator) }
        return base64URL(Data(bytes))
    }

    /**
     * @method base64URL
     * @description Bytes in base64url, without padding
     *
     * @param data The bytes
     * @returns Their encoding
     */
    private static func base64URL(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
