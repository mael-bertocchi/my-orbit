import SwiftUI

/**
 * @class CityField
 * @description The city of an operation, or a recurring one: as it is typed, the cities of earlier operations and those
 * the server finds are offered, and one has to be picked; Locate fills in the city the phone is in. A city reads in the
 * interface's language
 */
struct CityField: View {
    @Binding var location: String /*!< The place as it reads in the field */
    @Binding var place: PlaceReference? /*!< The city picked, nil while one is being typed */
    let kept: String? /*!< The place written before cities were checked, which may stay, if any */
    var isFocused: FocusState<Bool>.Binding /*!< Whether the field is being typed in */

    @Environment(LocalStore.self) private var store /*!< The budget, for the cities of earlier operations */
    @Environment(Places.self) private var places /*!< The cities, found by the server */
    @Environment(Preferences.self) private var preferences /*!< The device's settings, for the haptics */

    @State private var foundPlaces: [Place] = [] /*!< The cities the server found for the place typed */
    @State private var foundQuery = "" /*!< The place they were found for */
    @State private var isLocating = false /*!< Whether the city the phone is in is being looked for */
    @State private var locateError: String? /*!< Why it couldn't be found, nil when it could */

    /**
     * @method isChosen
     * @description Whether a city field can be saved as it is: empty, or a city picked from the suggestions or located. A
     * place written before cities were checked, which the server couldn't match to a city, may stay as it was written
     *
     * @param location The place as it reads
     * @param place The city picked
     * @param kept The place written before cities were checked, which may stay
     * @returns Whether it can be saved
     */
    static func isChosen(location: String, place: PlaceReference?, kept: String?) -> Bool {
        location.trimmingCharacters(in: .whitespaces).isEmpty || place != nil || (kept != nil && location == kept)
    }

    /**
     * @method body
     * @description The field, its suggestions, and why it can't be saved yet
     */
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            GlassField(label: String(appLocalized: "City")) {
                HStack(spacing: 8) {
                    Image(systemName: "mappin")
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.accent)
                    TextField("", text: typed, prompt: Text("Berlin").foregroundStyle(Theme.faint))
                        .focused(isFocused)
                        .accessibilityLabel("City")
                    locateButton
                }
            }

            if !suggestions.isEmpty {
                SuggestionList(suggestions: suggestions, onPick: pick)
            }

            if let locateError {
                Text(locateError)
                    .font(Theme.font(11))
                    .foregroundStyle(Theme.warning)
            } else if !Self.isChosen(location: location, place: place, kept: kept) {
                Text("Pick a city from the suggestions, or use Locate.")
                    .font(Theme.font(11))
                    .foregroundStyle(Theme.muted)
            }
        }
        .task(id: query) {
            await search(query)
        }
    }

    /**
     * @method typed
     * @description The place as it is typed, which is no city until one is picked
     */
    private var typed: Binding<String> {
        Binding {
            location
        } set: { text in
            location = text
            place = nil
            locateError = nil
        }
    }

    /**
     * @method query
     * @description The place typed, while it is being typed, which the server is asked about; empty otherwise
     */
    private var query: String {
        isFocused.wrappedValue ? location.trimmingCharacters(in: .whitespaces) : ""
    }

    /**
     * @method options
     * @description The cities to suggest for the place typed: those of earlier operations first, then those the server
     * found, each once
     */
    private var options: [Place] {
        guard !query.isEmpty, place == nil else {
            return []
        }

        let earlier = BudgetMath.placeSuggestions(store.operations, typed: query).map { Place(id: $0.id, nameEn: $0.nameEn, nameFr: $0.nameFr, detail: "") }
        var seen = Set(earlier.map(\.id))
        let fresh = (foundQuery != query ? [] : foundPlaces).filter { seen.insert($0.id).inserted }
        return earlier + fresh
    }

    /**
     * @method suggestions
     * @description The cities to suggest, named in the interface's language
     */
    private var suggestions: [Suggestion] {
        options.map { Suggestion(value: $0.reference.name, detail: $0.detail, key: $0.id) }
    }

    /**
     * @method locateButton
     * @description The button at the end of the field, filling in the city the phone is in
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
     * @method search
     * @description Asks the server for the cities matching the place typed, once typing pauses, from two letters
     *
     * @param query The place typed
     */
    private func search(_ query: String) async {
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
     * @method settle
     * @description Takes a city picked or located, and puts the keyboard away
     *
     * @param city The city
     */
    private func settle(_ city: PlaceReference) {
        isFocused.wrappedValue = false
        place = city
        location = city.name
        locateError = nil
    }

    /**
     * @method pick
     * @description Takes the city a suggestion stands for
     *
     * @param suggestion The suggestion
     */
    private func pick(_ suggestion: Suggestion) {
        guard let picked = options.first(where: { $0.id == suggestion.key }) else {
            return
        }
        preferences.tap()
        settle(picked.reference)
    }

    /**
     * @method locate
     * @description Fills in the city the phone is in, or says why it can't
     */
    private func locate() async {
        isLocating = true
        defer {
            isLocating = false
        }

        do {
            settle(try await places.locateCity())
        } catch is CancellationError {
            return
        } catch {
            locateError = error.userMessage
        }
    }
}
