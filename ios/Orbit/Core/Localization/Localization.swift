import Foundation

/**
 * @type InterfaceLanguage
 * @description The languages the interface can be shown in. `automatic` follows the device (or the language picked for
 * the app in the iOS settings) and falls back to English when the device speaks neither
 */
enum InterfaceLanguage: String, CaseIterable, Identifiable {
    case automatic /*!< Follows the device */
    case english = "en" /*!< English */
    case french = "fr" /*!< French */

    var id: String { rawValue } /*!< Its identifier, for the picker */

    /**
     * @method title
     * @description How the picker names it: each language in itself, so it can be found whatever the interface speaks
     */
    var title: String {
        switch self {
        case .automatic: return String(appLocalized: "Automatic")
        case .english: return "English"
        case .french: return "Français"
        }
    }
}

/**
 * @type Localization
 * @description The language the interface is shown in. It can change while the app runs, which the main bundle can't
 * follow: it settles its localization once, at launch. So views take it from the `locale` environment value the root
 * sets, and strings built outside a view go through `String(appLocalized:)`, which looks them up in it
 */
enum Localization {
    /**
     * @constant supported
     * @description The languages the app is translated into
     */
    static let supported = ["en", "fr"]

    private(set) static var locale = Locale(identifier: resolve(.automatic)) /*!< The locale the interface is shown in */

    /**
     * @method isFrench
     * @description Whether the interface speaks French
     */
    static var isFrench: Bool {
        locale.language.languageCode == .french
    }

    /**
     * @method apply
     * @description Shows the interface in a language
     *
     * @param language The language picked
     */
    static func apply(_ language: InterfaceLanguage) {
        locale = Locale(identifier: resolve(language))
    }

    /**
     * @method resolve
     * @description The language a choice comes down to
     *
     * @param language The choice
     * @returns Its language code
     */
    private static func resolve(_ language: InterfaceLanguage) -> String {
        guard language == .automatic else {
            return language.rawValue
        }
        return Bundle.preferredLocalizations(from: supported, forPreferences: Locale.preferredLanguages).first ?? "en"
    }
}

extension String {
    /**
     * @constructor init
     * @description Looks a string up in the language the interface is set to. `String(localized:)` would answer in the
     * language the app launched in, which stops being the right one as soon as another is picked in Settings
     *
     * @param resource The string to look up
     */
    init(appLocalized resource: LocalizedStringResource) {
        var resource = resource
        resource.locale = Localization.locale
        self.init(localized: resource)
    }
}
