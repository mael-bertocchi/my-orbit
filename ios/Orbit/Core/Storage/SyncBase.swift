import Foundation

/**
 * @class SyncBase
 * @description The last budget the app and the server agreed on, with its revision: the base a three-way merge measures
 * each side's edits against
 */
struct SyncBase: Codable, Equatable {
    var document: BudgetDocument /*!< The budget both sides held */
    var revision: Int /*!< Its revision on the server */

    /**
     * @method load
     * @description Reads the base back from Application Support
     *
     * @returns The base, or nil when there is none yet
     */
    static func load() -> SyncBase? {
        guard let data = storedData() else {
            return nil
        }

        return try? JSONCoding.decoder.decode(SyncBase.self, from: data)
    }

    /**
     * @method storedData
     * @description The base as it is written in Application Support
     *
     * @returns Its JSON, or nil when there is none yet
     */
    static func storedData() -> Data? {
        try? Data(contentsOf: fileURL)
    }

    /**
     * @method save
     * @description Writes the base to Application Support
     */
    func save() {
        guard let data = try? JSONCoding.encoder.encode(self) else {
            return
        }

        try? data.write(to: Self.fileURL, options: .atomic)
    }

    /**
     * @method fileURL
     * @description Where the base is kept
     */
    private static var fileURL: URL {
        let directory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory.appending(path: "sync-base.json")
    }
}
