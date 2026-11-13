import SwiftUI

/**
 * @class ConnectionsSheet
 * @description The sheet listing the apps authorized with the passkey, such as Claude, each with a button to revoke it
 */
struct ConnectionsSheet: View {
    @Environment(Preferences.self) private var preferences /*!< The device's settings, for the haptics */
    @Environment(ApplicationSession.self) private var session /*!< The session with the server */
    @Environment(\.dismiss) private var dismiss /*!< Closes the sheet */

    @State private var connections: [ClientConnection]? /*!< The connected apps, nil until loaded */
    @State private var failure: String? /*!< Why the apps couldn't be loaded or one revoked */
    @State private var revoking: ClientConnection? /*!< The app whose revocation is being confirmed */
    @State private var pending: Set<String> = [] /*!< The apps being revoked */

    /**
     * @method body
     * @description The sheet
     */
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                SheetHeader(title: String(appLocalized: "External apps")) { dismiss() }
                    .padding(.bottom, 12)

                Text("Apps that can access your account. You can revoke their access at any time.")
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
        .confirmationDialog(revokingTitle, isPresented: isConfirming, titleVisibility: .visible, presenting: revoking) { connection in
            Button("Revoke", role: .destructive) {
                revoke(connection)
            }
            Button("Cancel", role: .cancel) {}
        } message: { _ in
            Text("It will lose its access to Orbit at once. To connect it again, you'll authorize it with your passkey.")
        }
    }

    /**
     * @method content
     * @description The apps, a spinner while they load, or a word that none is connected
     */
    @ViewBuilder
    private var content: some View {
        if let connections {
            if connections.isEmpty {
                EmptyStateCard(message: String(appLocalized: "No app is connected."))
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(connections.enumerated()), id: \.element.id) { index, connection in
                        row(connection)
                        if index < connections.count - 1 {
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
     * @method revokingTitle
     * @description The confirmation's question, naming the app
     */
    private var revokingTitle: String {
        String(appLocalized: "Revoke \(revoking?.name ?? "")?")
    }

    /**
     * @method isConfirming
     * @description Whether a revocation is being confirmed, cleared when the dialog closes
     */
    private var isConfirming: Binding<Bool> {
        Binding(
            get: { revoking != nil },
            set: { isShown in
                if !isShown {
                    revoking = nil
                }
            }
        )
    }

    /**
     * @method row
     * @description An app, with when it was authorized and last used, and its Revoke button
     *
     * @param connection The app
     * @returns The row
     */
    private func row(_ connection: ClientConnection) -> some View {
        HStack(spacing: 12) {
            IconTile(symbol: "powerplug", color: Theme.accent)
            VStack(alignment: .leading, spacing: 2) {
                Text(verbatim: connection.name)
                    .font(Theme.font(14))
                    .foregroundStyle(Theme.text)
                Text("Authorized: \(Formatting.relativeDay(connection.connectedAt))")
                    .font(Theme.font(11))
                    .foregroundStyle(Theme.faint)
                Text("Last used: \(Formatting.relativeDay(connection.lastUsedAt))")
                    .font(Theme.font(11))
                    .foregroundStyle(Theme.faint)
            }
            Spacer(minLength: 8)
            if pending.contains(connection.id) {
                ProgressView()
                    .controlSize(.small)
                    .tint(Theme.muted)
            } else {
                InlineLink(title: String(appLocalized: "Revoke")) {
                    preferences.tap()
                    revoking = connection
                }
            }
        }
        .padding(.vertical, 11)
        .padding(.horizontal, 14)
    }

    /**
     * @method load
     * @description Reads the connected apps from the server
     */
    private func load() async {
        do {
            connections = try await session.connections()
            failure = nil
        } catch {
            failure = String(appLocalized: "The external apps couldn't be loaded.")
        }
    }

    /**
     * @method revoke
     * @description Takes an app's access away
     *
     * @param connection The app
     */
    private func revoke(_ connection: ClientConnection) {
        pending.insert(connection.id)

        Task {
            do {
                try await session.revokeConnection(id: connection.id)
                connections?.removeAll { $0.id == connection.id }
                failure = nil
                preferences.success()
            } catch {
                failure = error.userMessage
            }
            pending.remove(connection.id)
        }
    }
}
