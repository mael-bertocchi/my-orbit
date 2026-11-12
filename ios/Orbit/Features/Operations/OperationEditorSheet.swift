import SwiftUI

/**
 * @type OperationEditorRoute
 * @description What the operation sheet is open on
 */
enum OperationEditorRoute: Identifiable {
    case new /*!< A new operation */
    case edit(String) /*!< An existing operation, by its id */

    /**
     * @method id
     * @description Its identifier, for the sheet
     */
    var id: String {
        switch self {
        case .new: return "new"
        case .edit(let operationId): return operationId
        }
    }
}

/**
 * @class OperationEditorSheet
 * @description The sheet logging or editing an operation: the amount in any currency with its euro equivalent at the
 * rate of its own day, the category, name, note, date and time, online or the place, and deleting it. As the name is typed,
 * the names of earlier operations matching it are offered; as the place is typed, the earlier places, then the cities the
 * server finds; Locate fills in the city the device is in. An occurrence of a recurring operation says so: changing it
 * changes that occurrence only
 */
struct OperationEditorSheet: View {
    let route: OperationEditorRoute /*!< What the sheet is open on */

    @Environment(LocalStore.self) private var store /*!< The budget */
    @Environment(ExchangeRates.self) private var rates /*!< The exchange rates */
    @Environment(Preferences.self) private var preferences /*!< The device's settings, for the haptics and the last currency used */
    @Environment(Places.self) private var places /*!< The cities, found by the server */
    @Environment(\.dismiss) private var dismiss /*!< Closes the sheet */

    @State private var amountText = "" /*!< The amount, as typed */
    @State private var currencyCode = Currency.euro.code /*!< The currency the amount is in */
    @State private var categoryId = "" /*!< The category picked */
    @State private var name = "" /*!< The name typed */
    @State private var description = "" /*!< The note typed */
    @State private var location = "" /*!< The place typed */
    @State private var date = Date.now /*!< When it happened */
    @State private var isOnline = false /*!< Whether it was paid online */

    @State private var showCurrencyPicker = false /*!< Whether the currency picker is open */
    @State private var showDatePicker = false /*!< Whether the date picker is shown */
    @State private var showDeleteConfirmation = false /*!< Whether the deletion is being confirmed */

    @State private var foundPlaces: [Place] = [] /*!< The cities the server found for the place typed */
    @State private var foundQuery = "" /*!< The place they were found for */
    @State private var isLocating = false /*!< Whether the city the device is in is being looked for */
    @State private var locateError: String? /*!< Why it couldn't be found, nil when it could */

    @FocusState private var focus: Field? /*!< The field being typed in */

    /**
     * @type Field
     * @description The sheet's text fields
     */
    private enum Field {
        case amount /*!< The amount */
        case name /*!< The name */
        case description /*!< The note */
        case location /*!< The place */
    }

    /**
     * @method body
     * @description The sheet
     */
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                if isOccurrence {
                    occurrenceNote
                        .padding(.bottom, 18)
                }

                amountBlock
                    .padding(.bottom, 8)

                RowDivider()
                    .padding(.vertical, 18)

                FieldLabel(String(appLocalized: "Category"))
                    .padding(.bottom, 10)
                categoryGrid
                    .padding(.bottom, 20)

                fields

                PrimaryButton(title: isEditing ? String(appLocalized: "Save changes") : String(appLocalized: "Save operation"), isDisabled: !isValid) {
                    save()
                }
                .padding(.top, 20)

                if isEditing {
                    Button {
                        showDeleteConfirmation = true
                    } label: {
                        Text("Delete operation")
                            .font(Theme.font(14))
                            .foregroundStyle(Theme.negative)
                            .frame(maxWidth: .infinity)
                            .expandedTapTarget(vertical: 14, horizontal: 8)
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 14)
                }
            }
            .padding(.top, 32)
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
        .confirmationDialog("Delete this operation?", isPresented: $showDeleteConfirmation, titleVisibility: .visible) {
            Button("Delete", role: .destructive) { delete() }
            Button("Cancel", role: .cancel) {}
        }
        .onAppear(perform: loadValues)
        .task(id: selectedDay) {
            await rates.load(day: selectedDay)
        }
        .onChange(of: amountText) { _, typed in
            let formatted = Formatting.groupedAmountInput(Formatting.sanitizeAmountInput(typed))
            if formatted != typed {
                amountText = formatted
            }
        }
        .task(id: locationQuery) {
            await searchPlaces(locationQuery)
        }
        .onChange(of: focus) { _, field in
            guard field != nil, showDatePicker else {
                return
            }
            withAnimation(.easeOut(duration: 0.2)) { showDatePicker = false }
        }
    }

    /**
     * @method isEditing
     * @description Whether an existing operation is being edited
     */
    private var isEditing: Bool {
        if case .edit = route {
            return true
        }
        return false
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
     * @method selectedDay
     * @description The day the operation happened on, whose rate prices it
     */
    private var selectedDay: String {
        ExchangeRates.day(from: date)
    }

    /**
     * @method storedRate
     * @description The rate the operation was saved with, while its currency and day are unchanged: it stands in until
     * that day's rate is loaded
     */
    private var storedRate: Double? {
        guard case .edit(let operationId) = route,
              let operation = store.operation(id: operationId),
              operation.currencyCode == currencyCode,
              ExchangeRates.day(from: operation.date) == selectedDay else {
            return nil
        }

        return operation.rateToEuro
    }

    /**
     * @method appliedRate
     * @description The rate the operation is priced at: its day's published rate, or the one it was saved with
     */
    private var appliedRate: Double? {
        rates.rate(code: currencyCode, on: selectedDay) ?? storedRate
    }

    /**
     * @method rateProblem
     * @description Why there is no rate to price the operation at, nil once there is one
     */
    private var rateProblem: String? {
        appliedRate == nil ? (rates.failure(on: selectedDay) ?? String(appLocalized: "Loading…")) : nil
    }

    /**
     * @method rateLine
     * @description The rate applied, or why it is missing
     */
    private var rateLine: String {
        guard let appliedRate else {
            return rates.failure(on: selectedDay) ?? String(appLocalized: "Loading…")
        }

        return String(appLocalized: "Rate \(Formatting.rate(appliedRate))")
    }

    /**
     * @method euroAmount
     * @description The amount in euros, nil until the rate is known
     */
    private var euroAmount: Double? {
        guard let appliedRate else {
            return nil
        }

        return amount * appliedRate
    }

    /**
     * @method isValid
     * @description Whether the operation can be saved: an amount, a name, a category and a rate
     */
    private var isValid: Bool {
        amount > 0 && !name.trimmingCharacters(in: .whitespaces).isEmpty && !categoryId.isEmpty && appliedRate != nil
    }

    /**
     * @method amountBlock
     * @description The amount, its currency and its euro equivalent
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

            if currency.code != Currency.euro.code {
                if let euroAmount {
                    Text(Formatting.euroPrecise(euroAmount))
                        .font(Theme.font(13))
                        .foregroundStyle(Theme.accent300)
                        .padding(.top, 4)
                }
                Text(rateLine)
                    .font(Theme.font(11))
                    .foregroundStyle(rateProblem == nil ? Theme.faint : Theme.warning)
                    .padding(.top, euroAmount == nil ? 4 : 0)
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
     * @description The name, the note, the date and time, and the place
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
                TextField(
                    "",
                    text: $description,
                    prompt: Text("Weekly groceries with Anna").foregroundStyle(Theme.faint),
                    axis: .vertical
                )
                .lineLimit(1...4)
                .focused($focus, equals: .description)
                .accessibilityLabel("Description")
            }

            VStack(alignment: .leading, spacing: 6) {
                FieldLabel(String(appLocalized: "Date"))
                Button {
                    preferences.tap()
                    focus = nil
                    withAnimation(.easeOut(duration: 0.2)) {
                        showDatePicker.toggle()
                    }
                } label: {
                    HStack {
                        Text(Formatting.fieldDate(date))
                            .font(Theme.font(14))
                            .foregroundStyle(Theme.text)
                        Spacer(minLength: 8)
                        Image(systemName: "calendar")
                            .font(.system(size: 14))
                            .foregroundStyle(Theme.muted)
                    }
                    .padding(.horizontal, 12)
                    .frame(minHeight: Theme.inputHeight)
                    .glassInput()
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)

                if showDatePicker {
                    DatePicker("", selection: $date, in: ...Date.now, displayedComponents: [.date, .hourAndMinute])
                        .datePickerStyle(.graphical)
                        .environment(\.locale, Formatting.clockLocale)
                        .tint(Theme.accent)
                        .labelsHidden()
                        .padding(.horizontal, 6)
                        .glassCard()
                }
            }

            onlineRow

            if !isOnline {
                VStack(alignment: .leading, spacing: 6) {
                    GlassField(label: String(appLocalized: "Location")) {
                        HStack(spacing: 8) {
                            Image(systemName: "mappin")
                                .font(.system(size: 14))
                                .foregroundStyle(Theme.accent)
                            TextField("", text: $location, prompt: Text("Berlin").foregroundStyle(Theme.faint))
                                .focused($focus, equals: .location)
                                .accessibilityLabel("Location")
                                .onChange(of: location) { _, _ in
                                    locateError = nil
                                }
                            locateButton
                        }
                    }

                    if !cityOptions.isEmpty {
                        SuggestionList(suggestions: cityOptions, onPick: pickLocation)
                    }

                    if let locateError {
                        Text(locateError)
                            .font(Theme.font(11))
                            .foregroundStyle(Theme.warning)
                    }
                }
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
    }

    /**
     * @method locateButton
     * @description The button at the end of the place, filling in the city the device is in
     */
    private var locateButton: some View {
        Button {
            preferences.tap()
            Task {
                await locate()
            }
        } label: {
            HStack(spacing: 4) {
                if isLocating {
                    ProgressView()
                        .controlSize(.mini)
                        .tint(Theme.accent)
                } else {
                    Image(systemName: "location")
                        .font(.system(size: 12, weight: .medium))
                }
                Text("Locate")
                    .font(Theme.font(13))
            }
            .foregroundStyle(Theme.accent)
            .expandedTapTarget(vertical: 10, horizontal: 6)
        }
        .buttonStyle(.plain)
        .disabled(isLocating)
        .accessibilityHint("Fill in the city you are in")
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
     * @method locationQuery
     * @description The place typed, while it is being typed, which the server is asked about; empty otherwise
     */
    private var locationQuery: String {
        focus == .location ? location.trimmingCharacters(in: .whitespaces) : ""
    }

    /**
     * @method cityOptions
     * @description The places to suggest for the place typed, while it is being typed: the earlier places first, then the
     * cities the server found, each once
     */
    private var cityOptions: [Suggestion] {
        guard !locationQuery.isEmpty else {
            return []
        }

        let earlier = BudgetMath.locationSuggestions(store.operations, typed: locationQuery)
        var seen = Set([BudgetMath.fold(locationQuery)] + earlier.map(BudgetMath.fold))
        var options = earlier.map { Suggestion(value: $0) }
        let fresh = foundQuery == locationQuery ? foundPlaces : []
        for place in fresh where seen.insert(BudgetMath.fold(place.name)).inserted {
            options.append(Suggestion(value: place.name, detail: place.detail))
        }
        return options
    }

    /**
     * @method searchPlaces
     * @description Asks the server for the cities matching the place typed, once typing pauses, from two letters
     *
     * @param query The place typed
     */
    private func searchPlaces(_ query: String) async {
        guard query.count >= 2 else {
            return
        }
        try? await Task.sleep(for: .milliseconds(250))
        guard !Task.isCancelled else {
            return
        }
        let found = await places.search(query)
        guard !Task.isCancelled else {
            return
        }
        foundPlaces = found
        foundQuery = query
    }

    /**
     * @method pickName
     * @description Fills in a name suggested, and puts the keyboard away
     *
     * @param value The name
     */
    private func pickName(_ value: String) {
        preferences.tap()
        name = value
        focus = nil
    }

    /**
     * @method pickLocation
     * @description Fills in a place suggested, and puts the keyboard away
     *
     * @param value The place
     */
    private func pickLocation(_ value: String) {
        preferences.tap()
        location = value
        focus = nil
    }

    /**
     * @method locate
     * @description Fills in the city the device is in, or says why it can't
     */
    private func locate() async {
        isLocating = true
        defer {
            isLocating = false
        }

        do {
            let city = try await places.locateCity()
            focus = nil
            location = city
            locateError = nil
        } catch is CancellationError {
            return
        } catch {
            locateError = error.userMessage
        }
    }

    /**
     * @method onlineRow
     * @description The online switch
     */
    private var onlineRow: some View {
        HStack(spacing: 10) {
            Image(systemName: "globe")
                .font(.system(size: 17))
                .foregroundStyle(Theme.accent)
            VStack(alignment: .leading, spacing: 1) {
                Text("Online")
                    .font(Theme.font(14))
                    .foregroundStyle(Theme.text)
                Text("No physical location")
                    .font(Theme.font(11))
                    .foregroundStyle(Theme.muted)
            }
            Spacer(minLength: 8)
            Toggle("", isOn: $isOnline.animation(.easeOut(duration: 0.2)))
                .labelsHidden()
                .tint(Theme.accent)
                .accessibilityLabel("Online")
        }
        .padding(.vertical, 12)
        .padding(.horizontal, 14)
        .glassCard(radius: Theme.controlRadius)
    }

    /**
     * @method existing
     * @description The operation edited, nil for a new one
     */
    private var existing: Operation? {
        guard case .edit(let operationId) = route else {
            return nil
        }
        return store.operation(id: operationId)
    }

    /**
     * @method isOccurrence
     * @description Whether the operation edited was logged by a recurring operation
     */
    private var isOccurrence: Bool {
        existing?.recurringId != nil
    }

    /**
     * @method occurrenceNote
     * @description The word that the operation was logged by a recurring operation, and that changing it changes it alone
     */
    private var occurrenceNote: some View {
        HStack(spacing: 10) {
            Image(systemName: "repeat")
                .font(.system(size: 15))
                .foregroundStyle(Theme.accent)
            Text("Logged by a recurring operation: changing it changes this occurrence only.")
                .font(Theme.font(12))
                .foregroundStyle(Theme.muted)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(.vertical, 12)
        .padding(.horizontal, 14)
        .glassCard(radius: Theme.controlRadius)
    }

    /**
     * @method loadValues
     * @description Fills the sheet with the operation edited, or the defaults of a new one: the last currency used, the
     * first category, the latest place
     */
    private func loadValues() {
        guard case .edit(let operationId) = route, let operation = store.operation(id: operationId) else {
            currencyCode = preferences.lastUsedCurrencyCode
            categoryId = store.categories.first?.id ?? ""
            location = store.latestLocation ?? ""
            return
        }
        amountText = Formatting.amountInput(operation.amount)
        currencyCode = operation.currencyCode
        categoryId = operation.categoryId
        name = operation.name
        description = operation.description ?? ""
        location = operation.location ?? ""
        date = operation.date
        isOnline = operation.isOnline
    }

    /**
     * @method dismissEditing
     * @description Puts the keyboard and the date picker away
     */
    private func dismissEditing() {
        focus = nil
        guard showDatePicker else {
            return
        }
        withAnimation(.easeOut(duration: 0.2)) { showDatePicker = false }
    }

    /**
     * @method save
     * @description Saves the operation, priced at its rate, then closes the sheet
     */
    private func save() {
        guard isValid else {
            return
        }
        let trimmedLocation = isOnline ? "" : location.trimmingCharacters(in: .whitespaces)
        let trimmedDescription = description.trimmingCharacters(in: .whitespacesAndNewlines)
        let existingId: String? = {
            if case .edit(let operationId) = route {
                return operationId
            }
            return nil
        }()

        guard let appliedRate else {
            return
        }

        let operation = Operation(
            id: existingId ?? UUID().uuidString,
            date: date,
            name: name.trimmingCharacters(in: .whitespaces),
            description: trimmedDescription.isEmpty ? nil : trimmedDescription,
            categoryId: categoryId,
            location: trimmedLocation.isEmpty ? nil : trimmedLocation,
            amount: amount,
            currencyCode: currencyCode,
            rateToEuro: appliedRate,
            isOnline: isOnline,
            recurringId: existing?.recurringId
        )

        store.upsertOperation(operation)
        preferences.lastUsedCurrencyCode = currencyCode
        preferences.success()
        dismiss()
    }

    /**
     * @method delete
     * @description Deletes the operation edited, then closes the sheet
     */
    private func delete() {
        guard case .edit(let operationId) = route else {
            return
        }
        store.deleteOperation(id: operationId)
        preferences.success()
        dismiss()
    }
}
