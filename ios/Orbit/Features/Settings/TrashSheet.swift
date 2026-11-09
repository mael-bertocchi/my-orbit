import SwiftUI

/**
 * @class TrashSheet
 * @description The sheet listing the deleted operations, which stay out of the budget until restored
 */
struct TrashSheet: View {
    @Environment(LocalStore.self) private var store /*!< The budget, for the categories */
    @Environment(Preferences.self) private var preferences /*!< The device's settings, for the haptics */
    @Environment(ApplicationSession.self) private var session /*!< The session with the server */
    @Environment(\.dismiss) private var dismiss /*!< Closes the sheet */

    @State private var operations: [TrashedOperation]? /*!< The operations in the trash, nil until loaded */
    @State private var failure: String? /*!< Why the trash couldn't be loaded or an operation restored */
    @State private var restoring: Set<String> = [] /*!< The operations being restored */

    /**
     * @method body
     * @description The sheet
     */
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                SheetHeader(title: String(appLocalized: "Trash")) { dismiss() }
                    .padding(.bottom, 12)

                Text("Deleted operations stay here, out of the budget, until you restore them.")
                    .font(Theme.font(12))
                    .foregroundStyle(Theme.muted)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.bottom, 18)

                if let failure {
                    Text(failure)
                        .font(Theme.font(12))
                        .foregroundStyle(Theme.negative)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.bottom, 12)
                }

                content
            }
            .padding(.top, 20)
            .padding(.horizontal, Theme.screenPadding)
            .padding(.bottom, 32)
        }
        .scrollIndicators(.hidden)
        .screenBackground()
        .presentationDragIndicator(.visible)
        .task {
            await load()
        }
        .refreshable {
            await load()
        }
    }

    /**
     * @method content
     * @description The operations, a spinner while they load, or a word that the trash is empty
     */
    @ViewBuilder
    private var content: some View {
        if let operations {
            if operations.isEmpty {
                EmptyStateCard(message: String(appLocalized: "The trash is empty."))
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(operations.enumerated()), id: \.element.id) { index, trashed in
                        row(trashed)
                        if index < operations.count - 1 {
                            RowDivider()
                        }
                    }
                }
                .glassCard()
            }
        } else if failure == nil {
            ProgressView()
                .tint(Theme.muted)
                .frame(maxWidth: .infinity)
                .padding(.top, 24)
        }
    }

    /**
     * @method row
     * @description An operation of the trash, with when it was deleted and its Restore button
     *
     * @param trashed The operation
     * @returns The row
     */
    private func row(_ trashed: TrashedOperation) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            OperationRow(operation: trashed.operation, category: store.categoryOrFallback(id: trashed.operation.categoryId))
            HStack(spacing: 8) {
                Text("Deleted: \(Formatting.relativeDay(trashed.deletedAt))")
                    .font(Theme.font(11))
                    .foregroundStyle(Theme.faint)
                Spacer(minLength: 8)
                if restoring.contains(trashed.id) {
                    ProgressView()
                        .controlSize(.small)
                        .tint(Theme.muted)
                } else {
                    InlineLink(title: String(appLocalized: "Restore")) {
                        restore(trashed)
                    }
                }
            }
            .padding(.horizontal, 14)
            .padding(.bottom, 6)
        }
    }

    /**
     * @method load
     * @description Reads the trash from the server
     */
    private func load() async {
        do {
            operations = try await session.trash()
            failure = nil
        } catch {
            failure = String(appLocalized: "The trash couldn't be loaded.")
        }
    }

    /**
     * @method restore
     * @description Takes an operation out of the trash, back into the budget
     *
     * @param trashed The operation
     */
    private func restore(_ trashed: TrashedOperation) {
        preferences.tap()
        restoring.insert(trashed.id)

        Task {
            do {
                try await session.restore(id: trashed.id)
                operations?.removeAll { $0.id == trashed.id }
                failure = nil
                preferences.success()
            } catch {
                failure = error.userMessage
            }
            restoring.remove(trashed.id)
        }
    }
}
