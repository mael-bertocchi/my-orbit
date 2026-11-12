import SwiftUI

/**
 * @type RecurringEditorRoute
 * @description What the recurring operation sheet is open on
 */
enum RecurringEditorRoute: Identifiable {
    case new /*!< A new recurring operation */
    case edit(RecurringOperation) /*!< An existing recurring operation */

    /**
     * @method id
     * @description Its identifier, for the sheet
     */
    var id: String {
        switch self {
        case .new: return "new"
        case .edit(let recurring): return recurring.id
        }
    }
}

/**
 * @type RecurringDay
 * @description The days a recurring operation is set on, written `YYYY-MM-DD` as the server keeps them
 */
enum RecurringDay {
    /**
     * @method date
     * @description Reads a day into its midnight, in the device's time zone
     *
     * @param key The day
     * @returns Its midnight, or nil for a malformed day
     */
    static func date(_ key: String) -> Date? {
        let parts = key.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else {
            return nil
        }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .current
        return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
    }

    /**
     * @method key
     * @description Writes the day a date falls on, in the device's time zone
     *
     * @param date The date
     * @returns The day
     */
    static func key(_ date: Date) -> String {
        ExchangeRates.day(from: date)
    }

    /**
     * @method intervalTitle
     * @description How often a recurring operation comes back, in words
     *
     * @param months How many months lie between two occurrences
     * @returns The words
     */
    static func intervalTitle(_ months: Int) -> String {
        switch months {
        case 3: return String(appLocalized: "Every quarter")
        case 6: return String(appLocalized: "Every six months")
        case 12: return String(appLocalized: "Every year")
        default: return String(appLocalized: "Every month")
        }
    }

    /**
     * @constant intervals
     * @description How many months may lie between two occurrences: every month, quarter, half year or year
     */
    static let intervals = [1, 3, 6, 12]
}

/**
 * @class RecurringEditorSheet
 * @description The sheet creating or editing a recurring operation: what each occurrence logs (amount in any currency,
 * category, name, note, online or the place), how often and from when, an optional end, a pause, and deleting it.
 * Saving goes straight to the server, which logs the occurrences already due
 */
struct RecurringEditorSheet: View {
    let route: RecurringEditorRoute /*!< What the sheet is open on */
    let onSaved: (RecurringOperation) -> Void /*!< Called with the stored recurring operation */
    let onDeleted: (String) -> Void /*!< Called with the id of the deleted one */

    @Environment(LocalStore.self) private var store /*!< The budget, for the categories */
    @Environment(ExchangeRates.self) private var rates /*!< The exchange rates */
    @Environment(Preferences.self) private var preferences /*!< The device's settings, for the haptics and the last currency used */
    @Environment(ApplicationSession.self) private var session /*!< The session with the server */
    @Environment(\.dismiss) private var dismiss /*!< Closes the sheet */

    @State private var amountText = "" /*!< The amount, as typed */
    @State private var currencyCode = Currency.euro.code /*!< The currency the amount is in */
    @State private var categoryId = "" /*!< The category picked */
    @State private var name = "" /*!< The name typed */
    @State private var description = "" /*!< The note typed */
    @State private var location = "" /*!< The city as it reads in the field */
    @State private var place: PlaceReference? /*!< The city picked, nil while one is being typed */
    @State private var keptLocation: String? /*!< The place written before cities were checked, which may stay */
    @State private var isOnline = false /*!< Whether it is paid online */
    @State private var firstDate = Date.now /*!< Its first occurrence */
    @State private var intervalMonths = 1 /*!< How many months lie between two occurrences */
    @State private var hasEnd = false /*!< Whether it ends */
    @State private var endDate = Date.now /*!< The last day it may fall on, when it ends */
    @State private var isPaused = false /*!< Whether its occurrences are skipped for now */

    @State private var showCurrencyPicker = false /*!< Whether the currency picker is open */
    @State private var showDeleteConfirmation = false /*!< Whether the deletion is being confirmed */
    @State private var isWorking = false /*!< Whether a save or a deletion is under way */
    @State private var failure: String? /*!< Why the last save or deletion failed */

    @FocusState private var focus: Field? /*!< The field being typed in */
    @FocusState private var isCityFocused: Bool /*!< Whether the city is being typed in */

    /**
     * @type Field
     * @description The sheet's text fields
     */
    private enum Field {
        case amount /*!< The amount */
        case name /*!< The name */
        case description /*!< The note */
    }

    /**
     * @method body
     * @description The sheet
     */
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                SheetHeader(title: existing != nil ? String(appLocalized: "Edit recurring operation") : String(appLocalized: "New recurring operation")) { dismiss() }
                    .padding(.bottom, 18)

                amountBlock
                    .padding(.bottom, 8)

                RowDivider()
                    .padding(.vertical, 18)

                FieldLabel(String(appLocalized: "Category"))
                    .padding(.bottom, 10)
                categoryGrid
                    .padding(.bottom, 20)

                fields

                if let failure {
                    Text(failure)
                        .font(Theme.font(12))
                        .foregroundStyle(Theme.negative)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 14)
                }

                PrimaryButton(title: existing != nil ? String(appLocalized: "Save changes") : String(appLocalized: "Save recurring operation"), isDisabled: !isValid || isWorking) {
                    save()
                }
                .padding(.top, 20)

                if existing != nil {
                    Button {
                        showDeleteConfirmation = true
                    } label: {
                        Text("Delete recurring operation")
                            .font(Theme.font(14))
                            .foregroundStyle(Theme.negative)
                            .frame(maxWidth: .infinity)
                            .expandedTapTarget(vertical: 14, horizontal: 8)
                    }
                    .buttonStyle(.plain)
                    .disabled(isWorking)
                    .padding(.top, 14)
                }
            }
            .padding(.top, 20)
            .padding(.horizontal, Theme.screenPadding)
            .padding(.bottom, 32)
            .background(
                Color.clear
                    .contentShape(Rectangle())
                    .onTapGesture { dismissEditing() }
            )
        }
        .scrollIndicators(.hidden)
        .scrollDismissesKeyboard(.interactively)
        .screenBackground()
        .presentationDragIndicator(.visible)
        .sheet(isPresented: $showCurrencyPicker) {
            CurrencyPickerSheet(selection: $currencyCode)
                .presentationDetents([.medium, .large])
        }
        .confirmationDialog("Delete this recurring operation?", isPresented: $showDeleteConfirmation, titleVisibility: .visible) {
            Button("Delete", role: .destructive) { delete() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("No occurrence will be logged anymore. Those already logged stay in the budget.")
        }
        .onAppear(perform: loadValues)
        .onChange(of: amountText) { _, typed in
            let formatted = Formatting.groupedAmountInput(Formatting.sanitizeAmountInput(typed))
            if formatted != typed {
                amountText = formatted
            }
        }
    }

    /**
     * @method existing
     * @description The recurring operation edited, nil for a new one
     */
    private var existing: RecurringOperation? {
        if case .edit(let recurring) = route {
            return recurring
        }
        return nil
    }

    /**
     * @method currency
     * @description The currency the amount is in, with its latest rate
     */
    private var currency: Currency {
        rates.currency(code: currencyCode)
    }

    /**
     * @method amount
     * @description The amount typed, zero when there is none
     */
    private var amount: Double {
        Formatting.parseAmountInput(amountText) ?? 0
    }

    /**
     * @method isValid
     * @description Whether the recurring operation can be saved: an amount, a name, a category, and an end that doesn't
     * come before its first occurrence
     */
    private var isValid: Bool {
        amount > 0 && !name.trimmingCharacters(in: .whitespaces).isEmpty && !categoryId.isEmpty && (!hasEnd || RecurringDay.key(endDate) >= RecurringDay.key(firstDate)) && isPlaceValid
    }

    /**
     * @method isPlaceValid
     * @description Whether the city can be saved: none when paid online, otherwise empty, picked, or written before cities
     * were checked
     */
    private var isPlaceValid: Bool {
        isOnline || CityField.isChosen(location: location, place: place, kept: keptLocation)
    }

    /**
     * @method amountBlock
     * @description The amount, its currency and its euro equivalent at the latest rate
     */
    private var amountBlock: some View {
        VStack(spacing: 4) {
            FieldLabel(String(appLocalized: "Amount"))
            HStack(alignment: .center, spacing: 6) {
                TextField("", text: $amountText, prompt: Text(verbatim: Formatting.groupedAmountInput("0.00")).foregroundStyle(Theme.faint))
                    .font(Theme.font(44, .semibold))
                    .tracking(-0.88)
                    .foregroundStyle(Theme.text)
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.trailing)
                    .fixedSize(horizontal: true, vertical: false)
                    .focused($focus, equals: .amount)
                    .accessibilityLabel("Amount")

                Button {
                    preferences.tap()
                    showCurrencyPicker = true
                } label: {
                    HStack(spacing: 3) {
                        Text(currency.code)
                            .font(Theme.font(15))
                        Image(systemName: "chevron.down")
                            .font(.system(size: 11, weight: .semibold))
                    }
                    .foregroundStyle(Theme.text)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(Theme.neutral900, in: RoundedRectangle(cornerRadius: Theme.inputRadius, style: .continuous))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Currency, \(currency.title)")
            }
            .padding(.top, 2)

            if currency.code != Currency.euro.code, amount > 0 {
                Text(verbatim: "≈ " + Formatting.euroPrecise(rates.euroAmount(amount, code: currencyCode)))
                    .font(Theme.font(13))
                    .foregroundStyle(Theme.accent300)
                    .padding(.top, 4)
            }
        }
        .frame(maxWidth: .infinity)
    }

    /**
     * @method categoryGrid
     * @description The categories to pick from
     */
    private var categoryGrid: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 9), count: 4), spacing: 9) {
            ForEach(store.categories) { category in
                CategoryChip(category: category, isSelected: categoryId == category.id) {
                    preferences.tap()
                    withAnimation(.easeOut(duration: 0.15)) {
                        categoryId = category.id
                    }
                }
            }
        }
    }

    /**
     * @method fields
     * @description The name, with the names of earlier operations matching it, the note, the schedule, the end, online or
     * the city, and the pause
     */
    private var fields: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 6) {
                GlassField(label: String(appLocalized: "Name")) {
                    TextField("", text: $name, prompt: Text("Whole Foods").foregroundStyle(Theme.faint))
                        .focused($focus, equals: .name)
                        .accessibilityLabel("Name")
                }

                if !nameOptions.isEmpty {
                    SuggestionList(suggestions: nameOptions, onPick: pickName)
                }
            }

            GlassField(label: String(appLocalized: "Description")) {
                TextField("", text: $description, prompt: Text("Weekly groceries with Anna").foregroundStyle(Theme.faint), axis: .vertical)
                    .lineLimit(1...4)
                    .focused($focus, equals: .description)
                    .accessibilityLabel("Description")
            }

            GlassField(label: String(appLocalized: "Frequency")) {
                Picker("Frequency", selection: $intervalMonths) {
                    ForEach(RecurringDay.intervals, id: \.self) { months in
                        Text(verbatim: RecurringDay.intervalTitle(months)).tag(months)
                    }
                }
                .pickerStyle(.menu)
                .tint(Theme.text)
                .labelsHidden()
            }

            GlassField(label: String(appLocalized: "First occurrence")) {
                DatePicker("First occurrence", selection: $firstDate, displayedComponents: .date)
                    .tint(Theme.accent)
                    .labelsHidden()
            }

            Text("Every occurrence falls on this day of the month, or on the last day of a shorter month. Those already past are logged as soon as it is saved.")
                .font(Theme.font(11))
                .foregroundStyle(Theme.muted)
                .fixedSize(horizontal: false, vertical: true)

            switchRow(symbol: "calendar.badge.minus", title: String(appLocalized: "Ends"), hint: String(appLocalized: "No occurrence after a given day"), isOn: $hasEnd.animation(.easeOut(duration: 0.2)))

            if hasEnd {
                GlassField(label: String(appLocalized: "Last day")) {
                    DatePicker("Last day", selection: $endDate, in: firstDate..., displayedComponents: .date)
                        .tint(Theme.accent)
                        .labelsHidden()
                }
                .transition(.opacity.combined(with: .move(edge: .top)))
            }

            switchRow(symbol: "globe", title: String(appLocalized: "Online"), hint: String(appLocalized: "No physical location"), isOn: $isOnline.animation(.easeOut(duration: 0.2)))

            if !isOnline {
                CityField(location: $location, place: $place, kept: keptLocation, isFocused: $isCityFocused)
                .transition(.opacity.combined(with: .move(edge: .top)))
            }

            if existing != nil {
                switchRow(symbol: "pause.circle", title: String(appLocalized: "Paused"), hint: String(appLocalized: "Its occurrences are skipped meanwhile"), isOn: $isPaused)

                Text("Changes apply to the occurrences still to come; those already logged stay as they are.")
                    .font(Theme.font(11))
                    .foregroundStyle(Theme.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    /**
     * @method nameOptions
     * @description The names of earlier operations matching the name typed, while it is being typed
     */
    private var nameOptions: [Suggestion] {
        guard focus == .name else {
            return []
        }
        return BudgetMath.nameSuggestions(store.operations, typed: name).map { Suggestion(value: $0) }
    }

    /**
     * @method pickName
     * @description Fills in a name suggested, and puts the keyboard away
     *
     * @param suggestion The name suggested
     */
    private func pickName(_ suggestion: Suggestion) {
        preferences.tap()
        name = suggestion.value
        focus = nil
    }

    /**
     * @method dismissEditing
     * @description Puts the keyboard away
     */
    private func dismissEditing() {
        focus = nil
        isCityFocused = false
    }

    /**
     * @method switchRow
     * @description A setting with an icon, a title, a hint and a switch
     *
     * @param symbol Its SF Symbol
     * @param title What it toggles
     * @param hint A word on what it means
     * @param isOn Whether it is on
     * @returns The row
     */
    private func switchRow(symbol: String, title: String, hint: String, isOn: Binding<Bool>) -> some View {
        HStack(spacing: 10) {
            Image(systemName: symbol)
                .font(.system(size: 17))
                .foregroundStyle(Theme.accent)
            VStack(alignment: .leading, spacing: 1) {
                Text(verbatim: title)
                    .font(Theme.font(14))
                    .foregroundStyle(Theme.text)
                Text(verbatim: hint)
                    .font(Theme.font(11))
                    .foregroundStyle(Theme.muted)
            }
            Spacer(minLength: 8)
            Toggle("", isOn: isOn)
                .labelsHidden()
                .tint(Theme.accent)
                .accessibilityLabel(title)
        }
        .padding(.vertical, 12)
        .padding(.horizontal, 14)
        .glassCard(radius: Theme.controlRadius)
    }

    /**
     * @method loadValues
     * @description Fills the sheet with the recurring operation edited, or the defaults of a new one: the last currency
     * used, the first category, a first occurrence today
     */
    private func loadValues() {
        switch route {
        case .edit(let recurring):
            amountText = Formatting.amountInput(recurring.amount)
            currencyCode = recurring.currencyCode
            categoryId = recurring.categoryId
            name = recurring.name
            description = recurring.description ?? ""
            place = recurring.place
            location = recurring.whereabouts
            keptLocation = recurring.place != nil ? nil : recurring.location
            isOnline = recurring.isOnline
            firstDate = RecurringDay.date(recurring.firstDate) ?? .now
            intervalMonths = recurring.intervalMonths
            hasEnd = recurring.endDate != nil
            endDate = recurring.endDate.flatMap(RecurringDay.date) ?? firstDate
            isPaused = recurring.isPaused
        case .new:
            currencyCode = preferences.lastUsedCurrencyCode
            categoryId = store.categories.first?.id ?? ""
            endDate = firstDate
        }
    }

    /**
     * @method fieldsToSave
     * @description What the sheet holds, as the server takes it. An online one has no place; empty texts are sent as none
     */
    private var fieldsToSave: RecurringFields {
        let trimmedLocation = isOnline ? "" : location.trimmingCharacters(in: .whitespaces)
        let trimmedDescription = description.trimmingCharacters(in: .whitespacesAndNewlines)

        return RecurringFields(
            name: name.trimmingCharacters(in: .whitespaces),
            description: trimmedDescription.isEmpty ? nil : trimmedDescription,
            categoryId: categoryId,
            location: trimmedLocation.isEmpty ? nil : trimmedLocation,
            placeId: isOnline ? nil : place?.id,
            amount: amount,
            currencyCode: currencyCode,
            isOnline: isOnline,
            firstDate: RecurringDay.key(firstDate),
            intervalMonths: intervalMonths,
            endDate: hasEnd ? RecurringDay.key(endDate) : nil,
            isPaused: isPaused
        )
    }

    /**
     * @method save
     * @description Stores the recurring operation, then closes the sheet
     */
    private func save() {
        guard isValid else {
            return
        }
        dismissEditing()
        isWorking = true

        Task {
            do {
                let stored = try await session.saveRecurring(id: existing?.id, fieldsToSave)
                preferences.lastUsedCurrencyCode = currencyCode
                preferences.success()
                onSaved(stored)
                dismiss()
            } catch {
                failure = error.userMessage
            }
            isWorking = false
        }
    }

    /**
     * @method delete
     * @description Deletes the recurring operation edited, then closes the sheet
     */
    private func delete() {
        guard let existing else {
            return
        }
        isWorking = true

        Task {
            do {
                try await session.deleteRecurring(id: existing.id)
                preferences.success()
                onDeleted(existing.id)
                dismiss()
            } catch {
                failure = error.userMessage
            }
            isWorking = false
        }
    }
}
