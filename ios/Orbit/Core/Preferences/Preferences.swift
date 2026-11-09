import Foundation
import Observation

/**
 * @class Preferences
 * @description The settings kept on this device: the currency a new operation starts in, the haptics, the language
 */
@MainActor
@Observable
final class Preferences {
    var lastUsedCurrencyCode: String { /*!< The currency a new operation starts in: the last one used */
        didSet { UserDefaults.standard.set(lastUsedCurrencyCode, forKey: Keys.lastUsedCurrency) }
    }

    var hapticsEnabled: Bool { /*!< Whether taps and successes are felt */
        didSet { UserDefaults.standard.set(hapticsEnabled, forKey: Keys.haptics) }
    }

    var language: InterfaceLanguage { /*!< The language the interface is shown in */
        didSet {
            UserDefaults.standard.set(language.rawValue, forKey: Keys.language)
            Localization.apply(language)
        }
    }

    /**
     * @constructor init
     * @description Reads the settings back from the user defaults
     */
    init() {
        let defaults = UserDefaults.standard
        lastUsedCurrencyCode = defaults.string(forKey: Keys.lastUsedCurrency) ?? Currency.euro.code
        hapticsEnabled = defaults.object(forKey: Keys.haptics) as? Bool ?? true
        language = defaults.string(forKey: Keys.language).flatMap(InterfaceLanguage.init(rawValue:)) ?? .automatic
        Localization.apply(language)
    }

    /**
     * @method tap
     * @description A light tap, unless the haptics are off
     */
    func tap() {
        guard hapticsEnabled else {
            return
        }
        Haptics.tap()
    }

    /**
     * @method success
     * @description The success pattern, unless the haptics are off
     */
    func success() {
        guard hapticsEnabled else {
            return
        }
        Haptics.success()
    }

    /**
     * @type Keys
     * @description Where each setting is kept in the user defaults
     */
    private enum Keys {
        /**
         * @constant lastUsedCurrency
         * @description The currency a new operation starts in
         */
        static let lastUsedCurrency = "preferences.lastUsedCurrency"
        /**
         * @constant haptics
         * @description Whether the haptics are on
         */
        static let haptics = "preferences.haptics"
        /**
         * @constant language
         * @description The language picked
         */
        static let language = "preferences.language"
    }
}
