import SwiftUI

/**
 * @type AppTab
 * @description The app's tabs
 */
enum AppTab: String, CaseIterable, Identifiable {
    case budget /*!< The budget ring and the categories */
    case history /*!< The operations, day by day */
    case analysis /*!< The spending over the last year, the recurring expenses and the habits */
    case settings /*!< The settings */

    var id: String { rawValue } /*!< Its identifier, for the tab view */
}

/**
 * @class RootView
 * @description The app's root: a spinner while the session starts, the sign-in screen, or the tabs
 */
struct RootView: View {
    @Environment(LocalStore.self) private var store /*!< The budget */
    @Environment(ApplicationSession.self) private var session /*!< The session with the server */

    /**
     * @method body
     * @description The screen the session calls for
     */
    var body: some View {
        Group {
            switch session.identityState {
            case .loading:
                ZStack {
                    AmbientBackground()
                    ProgressView()
                        .tint(Theme.accent)
                }
            case .signedOut:
                SignInView()
            case .signedIn:
                MainShell()
            }
        }
        .task {
            #if DEBUG
            if CommandLine.arguments.contains("-demo-empty") {
                DebugSeed.enterDemoEmpty(store: store)
                session.enterDemo()
                return
            }
            if CommandLine.arguments.contains("-demo") {
                DebugSeed.enterDemo(store: store)
                session.enterDemo()
                return
            }
            #endif
            await session.bootstrap()
            store.sealCompletedMonths()
        }
    }
}

/**
 * @class MainShell
 * @description The tabs, with the operation sheet they share; it follows the time zone and reconciles whenever the app
 * becomes active
 */
struct MainShell: View {
    @Environment(LocalStore.self) private var store /*!< The budget */
    @Environment(Preferences.self) private var preferences /*!< The device's settings, for the language */
    @Environment(ApplicationSession.self) private var session /*!< The session with the server */
    @Environment(\.scenePhase) private var scenePhase /*!< Whether the app is active */

    @State private var selection: AppTab = .budget /*!< The tab shown */
    @State private var editorRoute: OperationEditorRoute? /*!< What the operation sheet is open on, none while closed */
    @State private var historyFilter: HistoryFilter = .all /*!< The History filter, which the Budget tab sets when a category is opened */
    @State private var historyDateRange: DayRange? /*!< The History date filter, which the Budget tab sets to the month a category is opened from */
    @State private var timeZone = TimeZone.current.identifier /*!< The time zone the dates are read in */

    /**
     * @method body
     * @description The tab bar
     */
    var body: some View {
        TabView(selection: $selection) {
            Tab("Budget", systemImage: "chart.pie", value: AppTab.budget) {
                BudgetView(
                    onOpenCategory: openCategoryInHistory,
                    onNewOperation: { editorRoute = .new }
                )
                .screenBackground()
            }
            Tab("History", systemImage: "clock.arrow.circlepath", value: AppTab.history) {
                HistoryView(
                    filter: $historyFilter,
                    dateRange: $historyDateRange,
                    onSelect: { editorRoute = .edit($0.id) },
                    onNewOperation: { editorRoute = .new }
                )
                .screenBackground()
            }
            Tab("Analysis", systemImage: "chart.bar.xaxis", value: AppTab.analysis) {
                AnalysisView()
                    .screenBackground()
            }
            Tab("Settings", systemImage: "gearshape", value: AppTab.settings) {
                SettingsView()
                    .screenBackground()
            }
        }
        .id([preferences.language.rawValue, timeZone])
        .tabBarMinimizeBehavior(.onScrollDown)
        .sheet(item: $editorRoute) { route in
            OperationEditorSheet(route: route)
        }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.significantTimeChangeNotification)) { _ in
            followTimeZone()
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                followTimeZone()
                store.sealCompletedMonths()
                session.applicationBecameActive()
            }
        }
        .onAppear {
            #if DEBUG
            if let tab = UserDefaults.standard.string(forKey: "tab"),
               let target = AppTab(rawValue: tab) {
                selection = target
            }
            if UserDefaults.standard.string(forKey: "open") == "add" {
                editorRoute = .new
            }
            #endif
        }
    }

    /**
     * @method followTimeZone
     * @description Reads the dates in the time zone the phone is in now
     */
    private func followTimeZone() {
        NSTimeZone.resetSystemTimeZone()
        timeZone = TimeZone.current.identifier
    }

    /**
     * @method openCategoryInHistory
     * @description Shows a category's operations of a month in History, so a category opened from a past month lists
     * that month's operations
     *
     * @param category The category
     * @param month The month it was opened from
     */
    private func openCategoryInHistory(_ category: Category, month: Date) {
        historyFilter = .category(category.id)
        historyDateRange = DayRange(month: month)
        withAnimation(.spring(response: 0.32, dampingFraction: 0.82)) {
            selection = .history
        }
    }
}
