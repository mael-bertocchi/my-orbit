import SwiftUI

/**
 * @class OrbitApplication
 * @description The app: it builds the store, the rates, the places, the settings and the session once, and hands them to
 * every view
 */
@main
struct OrbitApplication: App {
    @State private var store: LocalStore /*!< The budget, saved on the device */
    @State private var rates: ExchangeRates /*!< The exchange rates */
    @State private var places: Places /*!< The cities, found by the server */
    @State private var preferences: Preferences /*!< The device's settings */
    @State private var session: ApplicationSession /*!< The session with the server, and the sync */

    /**
     * @constructor init
     * @description Builds the long-lived objects, sharing one server client and one token store
     */
    init() {
        let store = LocalStore()
        let tokens = TokenStore()
        let api = APIClient(tokens: tokens)
        let rates = ExchangeRates(api: api)
        _store = State(initialValue: store)
        _rates = State(initialValue: rates)
        _places = State(initialValue: Places(api: api))
        _preferences = State(initialValue: Preferences())
        _session = State(initialValue: ApplicationSession(store: store, rates: rates, tokens: tokens, api: api))
    }

    /**
     * @method interfaceLocale
     * @description The locale the interface is shown in, read again whenever another language is picked
     */
    private var interfaceLocale: Locale {
        _ = preferences.language
        return Localization.locale
    }

    /**
     * @method body
     * @description The app's one window, dark, in the language picked
     */
    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(store)
                .environment(rates)
                .environment(places)
                .environment(preferences)
                .environment(session)
                .environment(\.locale, interfaceLocale)
                .tint(Theme.accent)
                .preferredColorScheme(.dark)
                .dynamicTypeSize(...DynamicTypeSize.accessibility1)
        }
    }
}
