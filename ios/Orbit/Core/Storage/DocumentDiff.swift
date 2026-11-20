import Foundation

/**
 * @type BudgetWrite
 * @description One write to the server, entry by entry: what it takes to bring the server's budget to the device's
 */
enum BudgetWrite: Equatable {
    case createOperation(Operation) /*!< Logs an operation under its id */
    case updateOperation(Operation) /*!< Changes an operation */
    case deleteOperation(id: String) /*!< Moves an operation to the trash */
    case deleteEveryOperation /*!< Moves every operation to the trash, as a reset does */
    case storeCategory(Category, position: Int) /*!< Creates or replaces a category, at its place in the list */
    case deleteCategory(id: String) /*!< Removes a category */
    case storeSettings(BudgetSettings) /*!< Stores the monthly budget */
    case storeMonth(String, MonthlyBudget) /*!< Stores the budget of a finished month */
    case deleteMonth(String) /*!< Forgets the budget of a finished month */
}

/**
 * @type DocumentDiff
 * @description The writes that turn the server's budget into the device's: only the entries that differ, never the
 * whole budget
 */
enum DocumentDiff {

    /**
     * @method writes
     * @description The writes that bring `remote` to `local`. The operations are not part of it: the device sends its
     * own one by one, after these, so an operation never lands before the category it is filed under
     *
     * @param remote The budget as the server holds it
     * @param local The budget as the device wants it
     * @returns The writes, in the order to send them
     */
    static func writes(from remote: BudgetDocument, to local: BudgetDocument) -> [BudgetWrite] {
        let settings: [BudgetWrite] = remote.budget != local.budget ? [.storeSettings(local.budget)] : []

        return categoryWrites(from: remote.categories, to: local.categories)
            + settings
            + historyWrites(from: remote.budgetHistory, to: local.budgetHistory)
    }

    /**
     * @method categoryWrites
     * @description The writes that turn one list of categories into another, their order included
     *
     * @param remote The server's categories
     * @param local The device's categories
     * @returns The writes
     */
    private static func categoryWrites(from remote: [Category], to local: [Category]) -> [BudgetWrite] {
        let stored = Dictionary(remote.enumerated().map { ($1.id, ($1, $0)) }, uniquingKeysWith: { first, _ in first })
        let kept = Set(local.map(\.id))

        let stores: [BudgetWrite] = local.enumerated().compactMap { position, category in
            guard case let (known, knownPosition)? = stored[category.id], known == category, knownPosition == position else {
                return .storeCategory(category, position: position)
            }

            return nil
        }

        return stores + remote.filter { !kept.contains($0.id) }.map { BudgetWrite.deleteCategory(id: $0.id) }
    }

    /**
     * @method historyWrites
     * @description The writes that turn one budget history into another
     *
     * @param remote The server's history
     * @param local The device's history
     * @returns The writes
     */
    private static func historyWrites(from remote: [String: MonthlyBudget], to local: [String: MonthlyBudget]) -> [BudgetWrite] {
        let stores: [BudgetWrite] = local.keys.sorted().compactMap { month in
            remote[month] != local[month] ? local[month].map { BudgetWrite.storeMonth(month, $0) } : nil
        }

        return stores + remote.keys.sorted().filter { local[$0] == nil }.map { BudgetWrite.deleteMonth($0) }
    }
}
