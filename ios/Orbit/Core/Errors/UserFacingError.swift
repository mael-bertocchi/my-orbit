import Foundation

/**
 * @type UserFacingError
 * @description An error whose description is written for the person, in the interface's language. Every failure the
 * app shows goes through one: anything else is a bug, whose description is never shown
 */
protocol UserFacingError: LocalizedError {}

extension Error {
    /**
     * @method userMessage
     * @description The message to show for any error: its own when it was written for the person, a generic one
     * otherwise
     */
    var userMessage: String {
        (self as? UserFacingError)?.errorDescription ?? String(appLocalized: "Something went wrong.")
    }
}
