import AuthenticationServices
import SwiftUI

/**
 * @class SignInView
 * @description The sign-in screen: the mark with what the budget keeps track of turning around it, a sentence on what
 * Orbit holds and one button opening the Orbit portal in a secure sheet, where the passkey lives
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

            GeometryReader { proxy in
                ScrollView {
                    VStack(spacing: 0) {
                        OrbitHero()
                            .padding(.bottom, 20)
                        header
                            .padding(.bottom, 32)
                        signInButton
                        status
                    }
                    .padding(.horizontal, Theme.screenPadding)
                    .padding(.vertical, 32)
                    .frame(maxWidth: .infinity, minHeight: proxy.size.height)
                }
                .scrollIndicators(.hidden)
                .scrollBounceBehavior(.basedOnSize)
            }
        }
    }

    /**
     * @method header
     * @description Orbit's name, large, and what it holds
     */
    private var header: some View {
        VStack(spacing: 14) {
            Text(verbatim: "Orbit")
                .font(Theme.font(56, .semibold))
                .tracking(-1.8)
                .foregroundStyle(Theme.text)
            Text("Your spending, your limits and everything that orbits your budget, together in one place.")
                .font(Theme.font(19, .medium))
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 340)
        }
    }

    /**
     * @method signInButton
     * @description The one button, a light capsule that opens the portal's passkey sheet without saying how
     */
    private var signInButton: some View {
        Button {
            signIn()
        } label: {
            Text("Sign in")
                .font(Theme.font(16, .semibold))
                .foregroundStyle(Theme.background)
                .padding(.horizontal, 34)
                .frame(height: 48)
                .background(isSigningIn ? Theme.accent : Theme.accent200, in: Capsule())
        }
        .buttonStyle(.plain)
        .disabled(isSigningIn)
    }

    /**
     * @method status
     * @description The spinner while signing in, or why the last attempt failed
     */
    @ViewBuilder
    private var status: some View {
        if isSigningIn {
            ProgressView()
                .tint(Theme.accent)
                .padding(.top, 18)
        } else if let errorMessage {
            Text(errorMessage)
                .font(Theme.font(13))
                .foregroundStyle(Theme.negative)
                .multilineTextAlignment(.center)
                .padding(.top, 14)
                .transition(.opacity)
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
