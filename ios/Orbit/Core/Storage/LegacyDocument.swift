import Foundation

/**
 * @type LegacyDocument
 * @description Brings a budget saved by an older version of the app up to the current shape before it is decoded
 */
enum LegacyDocument {
    /**
     * @method migrated
     * @description Drops the income entries the app no longer has, fills in the fields added since, and moves renamed
     * categories to their current id
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
        renameCategories(in: &object)
        guard let migrated = try? JSONSerialization.data(withJSONObject: object) else {
            return data
        }
        return migrated
    }

    /**
     * @constant renamedCategories
     * @description Category ids that shipped under another name, by their old id
     */
    private static let renamedCategories: [String: String] = ["health": "selfcare"]

    /**
     * @method renameCategories
     * @description Moves the renamed categories, the operations filed under them and the limits frozen in the history to
     * their current id. A category stored under both ids is kept once, as the one under the current id
     *
     * @param object The stored budget, as a JSON object
     */
    private static func renameCategories(in object: inout [String: Any]) {
        if let categories = object["categories"] as? [[String: Any]] {
            let storedIds = Set(categories.compactMap { $0["id"] as? String })
            object["categories"] = categories.compactMap { category -> [String: Any]? in
                guard let id = category["id"] as? String, let current = renamedCategories[id] else {
                    return category
                }
                guard !storedIds.contains(current) else {
                    return nil
                }

                var renamed = category
                renamed["id"] = current
                return renamed
            }
        }
        if let operations = object["operations"] as? [[String: Any]] {
            object["operations"] = operations.map { operation in
                guard let id = operation["categoryId"] as? String, let current = renamedCategories[id] else {
                    return operation
                }

                var renamed = operation
                renamed["categoryId"] = current
                return renamed
            }
        }
        if let history = object["budgetHistory"] as? [String: [String: Any]] {
            object["budgetHistory"] = history.mapValues { snapshot -> [String: Any] in
                guard let limits = snapshot["categoryLimits"] as? [String: Any] else {
                    return snapshot
                }

                var renamedLimits = limits
                for (id, current) in renamedCategories {
                    guard let limit = renamedLimits.removeValue(forKey: id), renamedLimits[current] == nil else {
                        continue
                    }

                    renamedLimits[current] = limit
                }

                var renamed = snapshot
                renamed["categoryLimits"] = renamedLimits
                return renamed
            }
        }
    }
}
