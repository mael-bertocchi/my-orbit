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
}
