import Foundation

/**
 * @type LegacyDocument
 * @description Brings a budget saved by an older version of the app up to the current shape before it is decoded
 */
enum LegacyDocument {
    /**
     * @method migrated
     * @description Drops the income entries the app no longer has and fills in the fields added since
     *
     * @param data The stored budget, as JSON
     * @returns The budget in the current shape, or the data untouched when it isn't JSON
     */
    static func migrated(_ data: Data) -> Data {
        guard var object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else {
            return data
        }
        for key in ["categories", "operations"] {
            guard let items = object[key] as? [[String: Any]] else {
                continue
            }
            object[key] = items.filter { ($0["type"] as? String) != "INCOME" }
        }
        if let operations = object["operations"] as? [[String: Any]] {
            object["operations"] = operations.map { operation in
                var updated = operation
                if updated["isOnline"] == nil {
                    updated["isOnline"] = false
                }
                return updated
            }
        }
        if object["budgetHistory"] == nil {
            object["budgetHistory"] = [String: Any]()
        }
        guard let migrated = try? JSONSerialization.data(withJSONObject: object) else {
            return data
        }
        return migrated
    }

    /**
     * @class StoredOperations
     * @description The operations an older version of the app kept in its budget file
     */
    private struct StoredOperations: Decodable {
        var operations: [Operation]? /*!< The operations, none in a file of this version */
    }

    /**
     * @class StoredBase
     * @description The operations an older version of the app kept in its sync base
     */
    private struct StoredBase: Decodable {
        var document: StoredOperations /*!< The budget both sides held */
    }

    /**
     * @method pendingChanges
     * @description The changes to send for the operations an older version of the app kept on the device: those it
     * logged or changed since the last sync, and those it deleted, measured against its sync base. Nothing once the
     * budget file holds no operation any more
     *
     * @param local The stored budget, as JSON
     * @param base The stored sync base, as JSON, if there is one
     * @returns The changes, in the order to send them
     */
    static func pendingChanges(local: Data, base: Data?) -> [PendingChange] {
        guard let operations = (try? JSONCoding.decoder.decode(StoredOperations.self, from: migrated(local)))?.operations else {
            return []
        }

        let known = base.flatMap { try? JSONCoding.decoder.decode(StoredBase.self, from: $0) }?.document.operations ?? []
        let knownById = Dictionary(known.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        let kept = Set(operations.map(\.id))

        let saves: [PendingChange] = operations.compactMap { operation in
            guard let stored = knownById[operation.id] else {
                return .save(operation, previous: nil)
            }
            return DocumentMerge.sameOperation(stored, operation) ? nil : .save(operation, previous: stored)
        }

        return saves + known.filter { !kept.contains($0.id) }.map { PendingChange.delete($0) }
    }
}
