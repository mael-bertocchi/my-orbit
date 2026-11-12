import CoreLocation
import Foundation
import Observation

/**
 * @class Place
 * @description A city the server suggests, named in each language, with its region and country
 */
struct Place: Decodable, Hashable {
    var id: String /*!< Its identity */
    var nameEn: String /*!< Its name in English */
    var nameFr: String /*!< Its name in French */
    var detail: String /*!< Its region and country in the interface's language, to tell two cities of the same name apart, empty when unknown */

    var reference: PlaceReference { PlaceReference(id: id, nameEn: nameEn, nameFr: nameFr) } /*!< The city, as an operation names it */
}

/**
 * @type PlacesError
 * @description Why the city the device is in can't be found
 */
enum PlacesError: UserFacingError {
    case denied /*!< Location access is turned off for the app */
    case unavailable /*!< The device couldn't tell where it is */
    case noCity /*!< The position is in no city */

    /**
     * @method errorDescription
     * @description What to tell the person, in the interface's language
     */
    var errorDescription: String? {
        switch self {
        case .denied: return String(appLocalized: "Location access is turned off for Orbit.")
        case .unavailable: return String(appLocalized: "Your position couldn't be found.")
        case .noCity: return String(appLocalized: "No city found where you are.")
        }
    }
}

/**
 * @class PositionFinder
 * @description Asks the device where it is, once, at about a kilometre: enough to tell the city. It asks for location
 * access the first time, while the app is in use only
 */
@MainActor
private final class PositionFinder: NSObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager() /*!< The device's location service */
    private var pending: CheckedContinuation<CLLocation, Error>? /*!< The search under way, if any */

    /**
     * @constructor init
     * @description Sets the location service up for a rough position
     */
    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyKilometer
    }

    /**
     * @method locate
     * @description Finds where the device is. A search already under way is given up for this one
     *
     * @returns The position
     */
    func locate() async throws -> CLLocation {
        finish(.failure(CancellationError()))
        return try await withCheckedThrowingContinuation { continuation in
            pending = continuation
            proceed()
        }
    }

    /**
     * @method proceed
     * @description Asks for location access when it was never asked, gives up when it is refused, and asks for the
     * position otherwise
     */
    private func proceed() {
        switch manager.authorizationStatus {
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        case .denied, .restricted:
            finish(.failure(PlacesError.denied))
        default:
            manager.requestLocation()
        }
    }

    /**
     * @method finish
     * @description Ends the search under way, if any
     *
     * @param result The position, or why there is none
     */
    private func finish(_ result: Result<CLLocation, Error>) {
        guard let pending else {
            return
        }
        self.pending = nil
        pending.resume(with: result)
    }

    /**
     * @method locationManagerDidChangeAuthorization
     * @description Goes on once location access is granted or refused
     */
    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        MainActor.assumeIsolated {
            guard pending != nil, self.manager.authorizationStatus != .notDetermined else {
                return
            }
            proceed()
        }
    }

    /**
     * @method locationManager
     * @description Hands the position over
     */
    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else {
            return
        }
        MainActor.assumeIsolated {
            finish(.success(location))
        }
    }

    /**
     * @method locationManager
     * @description Says why there is no position
     */
    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        let isDenied = (error as? CLError)?.code == .denied
        MainActor.assumeIsolated {
            finish(.failure(isDenied ? PlacesError.denied : PlacesError.unavailable))
        }
    }
}

/**
 * @class Places
 * @description The cities the operation editor suggests: those the server finds for what is typed, and the one the device
 * is in. The server asks Geoapify, so Geoapify never learns who asks
 */
@MainActor
@Observable
final class Places {
    @ObservationIgnored private let api: APIClient /*!< The server */
    @ObservationIgnored private let finder = PositionFinder() /*!< The device's position */
    @ObservationIgnored private var found: [String: [Place]] = [:] /*!< The cities found for each search of the run, so typing back doesn't ask again */

    /**
     * @constructor init
     * @description Builds the places around the server
     *
     * @param api The server
     */
    init(api: APIClient) {
        self.api = api
    }

    /**
     * @method language
     * @description The language the cities are named in: the interface's
     */
    private var language: String {
        Localization.isFrench ? "fr" : "en"
    }

    /**
     * @method search
     * @description Finds the cities whose name starts with what is typed, none when the server can't be reached: the
     * places of earlier operations still help
     *
     * @param query What is typed, two letters at least
     * @returns The cities, the likeliest first
     */
    func search(_ query: String) async -> [Place] {
        let key = "\(language):\(query.lowercased())"
        if let known = found[key] {
            return known
        }
        guard let places = try? await api.searchPlaces(query, language: language) else {
            return []
        }
        found[key] = places
        return places
    }

    /**
     * @method locateCity
     * @description Finds the city the device is in
     *
     * @returns The city. Throws a `PlacesError` or an `APIError` saying why it can't be found
     */
    func locateCity() async throws -> PlaceReference {
        let location = try await finder.locate()
        do {
            return try await api.locatePlace(latitude: location.coordinate.latitude, longitude: location.coordinate.longitude, language: language).reference
        } catch APIError.notFound {
            throw PlacesError.noCity
        }
    }
}
