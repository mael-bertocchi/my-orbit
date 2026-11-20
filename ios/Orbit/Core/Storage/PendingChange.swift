import Foundation

/**
 * @type PendingChange
 * @description A change to the operations made on the device and not yet stored on the server. The changes wait in the
 * order they were made, kept on the device, until the server takes them
 */
enum PendingChange: Codable, Equatable {
    case save(Operation, previous: Operation?) /*!< Logs an operation or changes it, with how it read before, none when it was logged on the device */
    case delete(Operation) /*!< Moves an operation to the trash, as it read */
    case deleteEvery /*!< Moves every operation to the trash, as a reset does */

    /**
     * @method write
     * @description The write that stores it on the server. A save is sent as a creation, which the server turns into a
     * change when it already holds the operation
     */
    var write: BudgetWrite {
        switch self {
        case .save(let operation, _): return .createOperation(operation)
        case .delete(let operation): return .deleteOperation(id: operation.id)
        case .deleteEvery: return .deleteEveryOperation
        }
    }
}

/**
 * @class PendingOperations
 * @description What the changes still waiting add up to, for showing them with the server's operations and its figures
 */
struct PendingOperations: Equatable {
    /**
     * @class Entry
     * @description One operation changed on the device: as the server holds it, and as it now reads
     */
    struct Entry: Equatable {
        var original: Operation? /*!< As the server holds it, none when it was logged on the device */
        var current: Operation? /*!< As it now reads, none once deleted */
    }

    var entries: [String: Entry] = [:] /*!< Each operation changed, by id */
    var deletesEvery = false /*!< Whether every operation the server holds is deleted */

    /**
     * @method folding
     * @description Adds up the changes waiting, oldest first
     *
     * @param changes The changes
     * @returns What they add up to
     */
    static func folding(_ changes: [PendingChange]) -> PendingOperations {
        var result = PendingOperations()

        for change in changes {
            switch change {
            case .save(let operation, let previous):
                result.entries[operation.id, default: Entry(original: previous, current: nil)].current = operation
            case .delete(let operation):
                result.entries[operation.id, default: Entry(original: operation, current: nil)].current = nil
            case .deleteEvery:
                result.entries = [:]
                result.deletesEvery = true
            }
        }

        return result
    }

    /**
     * @method saved
     * @description The operations logged or changed, as they now read, the latest first
     */
    var saved: [Operation] {
        entries.values.compactMap(\.current).sorted { $0.date > $1.date }
    }

    /**
     * @method hides
     * @description Whether an operation the server sent is replaced or deleted by a change still waiting
     *
     * @param id Its id
     * @returns Whether it is
     */
    func hides(_ id: String) -> Bool {
        deletesEvery || entries[id] != nil
    }

    /**
     * @method spendingChange
     * @description How the changes waiting move what a month spent, in all and per category, which the server's figures
     * don't count yet: each operation as it now reads is added, and as the server holds it taken off
     *
     * @param month Any day of the month
     * @returns The euros the month spent more, in all and per category, negative when it spent less
     */
    func spendingChange(in month: Date) -> Spending {
        var change = Spending(spent: 0, byCategory: [:])

        for entry in entries.values {
            for (operation, sign) in [(entry.current, 1.0), (entry.original, -1.0)] {
                guard let operation, BudgetMath.isSameMonth(operation.date, month) else {
                    continue
                }
                change.spent += sign * operation.euroAmount
                change.byCategory[operation.categoryId, default: 0] += sign * operation.euroAmount
            }
        }

        return change
    }
}
