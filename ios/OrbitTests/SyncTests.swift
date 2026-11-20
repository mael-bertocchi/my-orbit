import XCTest
@testable import Orbit

/**
 * @class SyncTests
 * @description The merge and the diff that decide what the device and the server keep of each other's edits, the
 * changes to the operations waiting on the device, and the text limits that keep a write from being refused
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
     * @method category
     * @description A category with the limit the tests change
     *
     * @param id Its id
     * @param limit Its monthly limit
     * @returns The category
     */
    private func category(_ id: String, _ limit: Double) -> Orbit.Category {
        Orbit.Category(id: id, name: id, symbol: "cart", colorHex: 0, monthlyLimit: limit)
    }

    /**
     * @method document
     * @description A budget holding only categories
     *
     * @param categories Its categories
     * @returns The budget
     */
    private func document(_ categories: [Orbit.Category]) -> BudgetDocument {
        BudgetDocument(categories: categories, budget: .default, budgetHistory: [:])
    }

    /**
     * @method testKeepsEachSideEdits
     * @description A category changed on each side, and one added on each side, all end up in the merge
     */
    func testKeepsEachSideEdits() {
        let base = document([category("a", 4), category("b", 20)])
        let local = document([category("a", 5), category("b", 20), category("c", 12)])
        let remote = document([category("a", 4), category("b", 22), category("d", 30)])

        let merged = DocumentMerge.merge(base: base, local: local, remote: remote)
        let limits = Dictionary(uniqueKeysWithValues: merged.categories.map { ($0.id, $0.monthlyLimit) })

        XCTAssertEqual(limits, ["a": 5, "b": 22, "c": 12, "d": 30])
    }

    /**
     * @method testEditBeatsDeletion
     * @description A category edited on the device while the server deleted it is kept with the edit, and sent back
     */
    func testEditBeatsDeletion() {
        let base = document([category("a", 4)])
        let local = document([category("a", 6)])
        let remote = document([])

        let merged = DocumentMerge.merge(base: base, local: local, remote: remote)

        XCTAssertEqual(merged.categories.map(\.monthlyLimit), [6])
        XCTAssertEqual(DocumentDiff.writes(from: remote, to: merged), [.storeCategory(category("a", 6), position: 0)])
    }

    /**
     * @method testDeletionOfAnUntouchedCategory
     * @description A category left alone on the device and deleted on the server is deleted, with nothing to send back
     */
    func testDeletionOfAnUntouchedCategory() {
        let base = document([category("a", 4)])
        let local = document([category("a", 4)])
        let remote = document([])

        let merged = DocumentMerge.merge(base: base, local: local, remote: remote)

        XCTAssertTrue(merged.categories.isEmpty)
        XCTAssertTrue(DocumentDiff.writes(from: remote, to: merged).isEmpty)
    }

    /**
     * @method testFoldsThePendingChanges
     * @description The changes waiting on the device show as they now read, and move the month's figures: a new
     * operation changed again counts once, a change counts its difference, a deletion takes the operation off, and a
     * reset hides every operation the server sent
     */
    func testFoldsThePendingChanges() {
        var edited = operation("a", "Bakery", 6)
        edited.date = day.addingTimeInterval(60)
        let pending = PendingOperations.folding([.save(operation("a", "Bakery", 4), previous: nil), .save(edited, previous: operation("a", "Bakery", 4)), .save(operation("b", "Market", 22), previous: operation("b", "Market", 20)), .delete(operation("c", "Cinema", 12))])

        XCTAssertEqual(pending.saved.map(\.amount), [6, 22])
        XCTAssertTrue(pending.hides("b"))
        XCTAssertTrue(pending.hides("c"))
        XCTAssertFalse(pending.hides("d"))
        XCTAssertEqual(pending.spendingChange(in: day).spent, 6 + 2 - 12)

        let reset = PendingOperations.folding([.delete(operation("c", "Cinema", 12)), .deleteEvery, .save(operation("e", "Cinema", 12), previous: nil)])

        XCTAssertTrue(reset.hides("d"))
        XCTAssertEqual(reset.saved.map(\.id), ["e"])
    }

    /**
     * @method testTurnsTheStoredOperationsIntoPendingChanges
     * @description The operations an older version kept on the device are sent when they were logged, changed or deleted
     * since the last sync, and left alone otherwise
     */
    func testTurnsTheStoredOperationsIntoPendingChanges() throws {
        let local = try JSONCoding.encoder.encode(["operations": [operation("a", "Bakery", 4), operation("b", "Market", 22), operation("c", "Cinema", 12)]])
        let base = try JSONCoding.encoder.encode(["document": ["operations": [operation("a", "Bakery", 4), operation("b", "Market", 20), operation("d", "Train", 30)]]])

        let changes = LegacyDocument.pendingChanges(local: local, base: base)

        XCTAssertEqual(changes, [.save(operation("b", "Market", 22), previous: operation("b", "Market", 20)), .save(operation("c", "Cinema", 12), previous: nil), .delete(operation("d", "Train", 30))])
        XCTAssertTrue(LegacyDocument.pendingChanges(local: try JSONCoding.encoder.encode(["budgetHistory": [String: Int]()]), base: base).isEmpty)
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

    /**
     * @method testReadsTheServersDayAndTimeOnThePhonesClock
     * @description An operation from the server is dated by its day and time as the phone's clock shows them, and one
     * saved on the phone keeps its date
     */
    func testReadsTheServersDayAndTimeOnThePhonesClock() throws {
        let remote = Data(#"{"id":"a","day":"2026-10-28","time":"23:30","date":"2026-10-28T14:30:00Z","name":"Bakery","categoryId":"groceries","amount":4,"currencyCode":"EUR","rateToEuro":1,"isOnline":false,"updatedAt":"2026-10-28T14:30:00Z"}"#.utf8)
        let decoded = try JSONCoding.decoder.decode(Orbit.Operation.self, from: remote)

        XCTAssertEqual(decoded.day, "2026-10-28")
        XCTAssertEqual(decoded.time, "23:30")

        let saved = try JSONCoding.decoder.decode(Orbit.Operation.self, from: JSONCoding.encoder.encode(operation("b", "Bakery", 4)))

        XCTAssertEqual(saved.date, day)
    }
}
