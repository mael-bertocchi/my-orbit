import Foundation

/**
 * @type DocumentMerge
 * @description The three-way merge of the budget: the device's edits and the server's are measured against the last
 * version both agreed on, so neither erases the other
 */
enum DocumentMerge {

    /**
     * @method merge
     * @description Merges the device's budget and the server's against their common base. Each side's edits are kept;
     * when both changed the same entry the device wins, and an edit always beats a deletion
     *
     * @param base The last budget both sides agreed on
     * @param local The device's budget
     * @param remote The server's budget
     * @returns The merged budget
     */
    static func merge(base: BudgetDocument, local: BudgetDocument, remote: BudgetDocument) -> BudgetDocument {
        BudgetDocument(
            categories: merge(base: base.categories, local: local.categories, remote: remote.categories, same: ==),
            operations: merge(base: base.operations, local: local.operations, remote: remote.operations, same: sameOperation),
            budget: local.budget == base.budget ? remote.budget : local.budget,
            budgetHistory: merge(base: base.budgetHistory, local: local.budgetHistory, remote: remote.budgetHistory)
        )
    }

    /**
     * @method sameContent
     * @description Whether two budgets hold the same thing, ignoring what the server rewrites on its own (sub-second
     * dates, update stamps)
     *
     * @param lhs One budget
     * @param rhs The other
     * @returns Whether they match
     */
    static func sameContent(_ lhs: BudgetDocument, _ rhs: BudgetDocument) -> Bool {
        guard lhs.categories == rhs.categories,
              lhs.budget == rhs.budget,
              lhs.budgetHistory == rhs.budgetHistory,
              lhs.operations.count == rhs.operations.count else {
            return false
        }

        let indexed = Dictionary(rhs.operations.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })

        return lhs.operations.allSatisfy { operation in
            indexed[operation.id].map { sameOperation(operation, $0) } ?? false
        }
    }

    /**
     * @method sameOperation
     * @description Whether two operations match once the server's own rewrites are set aside
     *
     * @param lhs One operation
     * @param rhs The other
     * @returns Whether they match
     */
    static func sameOperation(_ lhs: Operation, _ rhs: Operation) -> Bool {
        comparable(lhs) == comparable(rhs)
    }

    /**
     * @method comparable
     * @description An operation with its date rounded to the second and its update stamp blanked, as both sides can
     * compare it
     *
     * @param operation The operation
     * @returns Its comparable copy
     */
    private static func comparable(_ operation: Operation) -> Operation {
        var copy = operation
        copy.date = Date(timeIntervalSince1970: operation.date.timeIntervalSince1970.rounded(.down))
        copy.updatedAt = .distantPast
        return copy
    }

    /**
     * @method resolve
     * @description Picks one entry's merged value: the side that changed it since the base, or the device's when both
     * did
     *
     * @param base The entry in the base, if it was there
     * @param local The entry on the device, if it is there
     * @param remote The entry on the server, if it is there
     * @param same Whether two values match
     * @returns The merged entry, or nil when it is deleted
     */
    private static func resolve<Value>(base: Value?, local: Value?, remote: Value?, same: (Value, Value) -> Bool) -> Value? {
        if matches(local, base, same) {
            return remote
        }
        if matches(remote, base, same) {
            return local
        }

        return local ?? remote
    }

    /**
     * @method matches
     * @description Whether two optional values match: both missing, or both there and the same
     *
     * @param lhs One value
     * @param rhs The other
     * @param same Whether two values match
     * @returns Whether they match
     */
    private static func matches<Value>(_ lhs: Value?, _ rhs: Value?, _ same: (Value, Value) -> Bool) -> Bool {
        switch (lhs, rhs) {
        case (nil, nil): return true
        case let (lhs?, rhs?): return same(lhs, rhs)
        default: return false
        }
    }

    /**
     * @method merge
     * @description Merges two lists of identified entries against their base, keeping the device's order first
     *
     * @param base The list in the base
     * @param local The device's list
     * @param remote The server's list
     * @param same Whether two entries match
     * @returns The merged list
     */
    private static func merge<Item: Identifiable>(
        base: [Item],
        local: [Item],
        remote: [Item],
        same: (Item, Item) -> Bool
    ) -> [Item] where Item.ID == String {
        let baseById = Dictionary(base.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        let localById = Dictionary(local.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        let remoteById = Dictionary(remote.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })

        var seen = Set<String>()
        let order = (local + remote + base).map(\.id).filter { seen.insert($0).inserted }

        return order.compactMap { id in
            resolve(base: baseById[id], local: localById[id], remote: remoteById[id], same: same)
        }
    }

    /**
     * @method merge
     * @description Merges two dictionaries against their base, key by key
     *
     * @param base The dictionary in the base
     * @param local The device's dictionary
     * @param remote The server's dictionary
     * @returns The merged dictionary
     */
    private static func merge<Value: Equatable>(
        base: [String: Value],
        local: [String: Value],
        remote: [String: Value]
    ) -> [String: Value] {
        let keys = Set(base.keys).union(local.keys).union(remote.keys)

        return keys.reduce(into: [:]) { merged, key in
            merged[key] = resolve(base: base[key], local: local[key], remote: remote[key], same: ==)
        }
    }
}
