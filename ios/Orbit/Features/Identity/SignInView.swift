import AuthenticationServices
import SwiftUI

/**
 * @class SignInView
 * @description The sign-in screen: one button opening the Orbit portal in a secure sheet, where the passkey lives
 */
struct SignInView: View {
    @Environment(ApplicationSession.self) private var session /*!< The session to open */
    @Environment(Preferences.self) private var preferences /*!< The device's settings, for the haptics */
    @Environment(\.webAuthenticationSession) private var webAuthenticationSession /*!< Opens the portal's connect page in a browser sheet */

    @State private var isSigningIn = false /*!< Whether a sign-in is under way */
    @State private var errorMessage: String? /*!< Why the last sign-in failed, if it did */

    /**
     * @method body
     * @description The screen
     */
    var body: some View {
        ZStack {
            AmbientBackground()

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    header
                        .padding(.bottom, 32)

                    PrimaryButton(title: String(appLocalized: "Sign in with a passkey"), systemImage: "person.badge.key", isDisabled: isSigningIn) {
                        signIn()
                    }

                    if isSigningIn {
                        ProgressView()
                            .tint(Theme.accent)
                            .frame(maxWidth: .infinity)
                            .padding(.top, 18)
                    } else if let errorMessage {
                        Text(errorMessage)
                            .font(Theme.font(13))
                            .foregroundStyle(Theme.negative)
                            .padding(.top, 14)
                            .transition(.opacity)
                    }
                }
                .padding(.horizontal, Theme.screenPadding)
                .padding(.top, 80)
                .padding(.bottom, 40)
            }
            .scrollIndicators(.hidden)
        }
    }

    /**
     * @method header
     * @description Orbit's mark, its name and what signing in takes
     */
    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            ZStack {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(Theme.accent.opacity(0.16))
                    .frame(width: 60, height: 60)
                Image(systemName: "eurosign.circle.fill")
                    .font(.system(size: 30, weight: .regular))
                    .foregroundStyle(Theme.accent)
            }
            .padding(.bottom, 6)
            Text(verbatim: "Orbit")
                .font(Theme.font(30, .semibold))
                .tracking(-0.5)
                .foregroundStyle(Theme.text)
            Text("Sign in with your passkey to open your budget. The Orbit portal opens in a secure sheet to ask for it.")
                .font(Theme.font(14))
                .foregroundStyle(Theme.muted)
        }
    }

    /**
     * @method signIn
     * @description Opens the portal's connect page in an ephemeral browser sheet and trades the one-time code it hands
     * back for a session. Dismissing the sheet is not an error
     */
    private func signIn() {
        guard !isSigningIn else {
            return
        }
        preferences.tap()
        isSigningIn = true
        withAnimation { errorMessage = nil }

        let connection = PortalConnection()

        Task {
            defer { isSigningIn = false }

            do {
                let callback = try await webAuthenticationSession.authenticate(
                    using: connection.url(portal: ApplicationSession.portalURL),
                    callback: .customScheme(PortalConnection.callbackScheme),
                    preferredBrowserSession: .ephemeral,
                    additionalHeaderFields: [:]
                )
                try await session.signIn(code: connection.code(from: callback), verifier: connection.verifier)
                preferences.success()
            } catch let error as ASWebAuthenticationSessionError where error.code == .canceledLogin {
                return
            } catch let error as APIError {
                withAnimation { errorMessage = error.userMessage }
            } catch {
                withAnimation { errorMessage = String(appLocalized: "The sign-in didn't go through. Try again.") }
            }
        }
    }
}
