import UIKit

/**
 * @type Haptics
 * @description The taps the app gives under the finger
 */
enum Haptics {
    /**
     * @method tap
     * @description A light tap, for a choice
     */
    static func tap() {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    /**
     * @method success
     * @description The success pattern, once something is saved
     */
    static func success() {
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }

    /**
     * @method warning
     * @description The warning pattern, for something refused
     */
    static func warning() {
        UINotificationFeedbackGenerator().notificationOccurred(.warning)
    }
}
