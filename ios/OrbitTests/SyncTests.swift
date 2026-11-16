import XCTest
@testable import Orbit

/**
 * @class SyncTests
 * @description The merge and the diff that decide what the device and the server keep of each other's edits, and the
 * text limits that keep a write from being refused
 */
final class SyncTests: XCTestCase {
    /**
     * @constant day
     * @description The day every operation of the tests happened on
     */
    private let day = Date(timeIntervalSince1970: 1_763_200_000)

    /**
     * @method operation
     * @description An operation with the fields the tests change
     *
     * @param id Its id
     * @param name Its name
     * @param amount Its amount, in euros
     * @returns The operation
     */
    private func operation(_ id: String, _ name: String, _ amount: Double) -> Orbit.Operation {
        Orbit.Operation(id: id, date: day, name: name, categoryId: "groceries", amount: amount, updatedAt: day)
    }

    /**
     * @method document
     * @description A budget holding only operations
     *
     * @param operations Its operations
     * @returns The budget
     */
    private func document(_ operations: [Orbit.Operation]) -> BudgetDocument {
        BudgetDocument(categories: Orbit.Category.defaults, operations: operations, budget: .default, budgetHistory: [:])
    }

    /**
     * @method testKeepsEachSideEdits
     * @description An operation changed on each side, and one added on each side, all end up in the merge
     */
    func testKeepsEachSideEdits() {
        let base = document([operation("a", "Bakery", 4), operation("b", "Market", 20)])
        let local = document([operation("a", "Bakery", 5), operation("b", "Market", 20), operation("c", "Cinema", 12)])
        let remote = document([operation("a", "Bakery", 4), operation("b", "Market", 22), operation("d", "Train", 30)])

        let merged = DocumentMerge.merge(base: base, local: local, remote: remote)
        let amounts = Dictionary(uniqueKeysWithValues: merged.operations.map { ($0.id, $0.amount) })

        XCTAssertEqual(amounts, ["a": 5, "b": 22, "c": 12, "d": 30])
    }

    /**
     * @method testEditBeatsDeletion
     * @description An operation edited on the device while the server deleted it is kept with the edit, as the web page
     * does too
     */
    func testEditBeatsDeletion() {
        let base = document([operation("a", "Bakery", 4)])
        let local = document([operation("a", "Bakery", 6)])
        let remote = document([])

        let merged = DocumentMerge.merge(base: base, local: local, remote: remote)

        XCTAssertEqual(merged.operations.map(\.amount), [6])
        XCTAssertEqual(DocumentDiff.writes(from: remote, to: merged), [.createOperation(operation("a", "Bakery", 6))])
    }

    /**
     * @method testDeletionOfAnUntouchedOperation
     * @description An operation left alone on the device and deleted on the server is deleted, with nothing to send back
     */
    func testDeletionOfAnUntouchedOperation() {
        let base = document([operation("a", "Bakery", 4)])
        let local = document([operation("a", "Bakery", 4)])
        let remote = document([])

        let merged = DocumentMerge.merge(base: base, local: local, remote: remote)

        XCTAssertTrue(merged.operations.isEmpty)
        XCTAssertTrue(DocumentDiff.writes(from: remote, to: merged).isEmpty)
    }

    /**
     * @method testNothingToSendWhenInStep
     * @description Two budgets alike, down to the server's update stamps, need no write
     */
    func testNothingToSendWhenInStep() {
        var stamped = operation("a", "Bakery", 4)
        stamped.updatedAt = .now
        let remote = document([stamped])
        let local = document([operation("a", "Bakery", 4)])

        XCTAssertTrue(DocumentMerge.sameContent(local, remote))
        XCTAssertTrue(DocumentDiff.writes(from: remote, to: local).isEmpty)
    }

    /**
     * @method testCapsTextAsTheServerCounts
     * @description A text past a limit is cut in UTF-16 units, as the server counts them, without splitting an emoji
     */
    func testCapsTextAsTheServerCounts() {
        XCTAssertEqual(TextLimits.capped("Bakery", to: TextLimits.name), "Bakery")
        XCTAssertEqual(TextLimits.capped(String(repeating: "a", count: 130), to: TextLimits.name).utf16.count, 120)
        XCTAssertEqual(TextLimits.capped("ab😀", to: 3), "ab")
    }
}
