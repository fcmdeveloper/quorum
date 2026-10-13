import CoreNFC
import ExpoModulesCore
import TangemSdk

/// Puente mínimo hacia Tangem SDK usando su interfaz JSON-RPC
/// (métodos SCAN, SIGN_HASH, DERIVE_WALLET_PUBLIC_KEY).
/// La clave privada nunca sale de la tarjeta: solo viajan hashes, firmas y claves públicas.
public class TangemNfcModule: Module {
  private lazy var sdk: TangemSdk = {
    var config = Config() // canonizeSecp256k1Signatures = true por defecto (S bajo)
    // Al escanear, deriva en la misma lectura la dirección XRP que usa la app Tangem
    // (Wallet 2.0 / frase semilla): llega en wallets[].derivedKeys.
    if let xrpPath = try? DerivationPath(rawPath: "m/44'/144'/0'/0/0") {
      config.defaultDerivationPaths = [.secp256k1: [xrpPath]]
    }
    // Código de acceso: la primera vez se escribe y queda guardado en el llavero de este
    // teléfono, cifrado con el Secure Enclave y protegido con Face ID. Las siguientes
    // veces basta con Face ID. (Es una copia propia de Quorum; la app Tangem guarda la suya.)
    config.accessCodeRequestPolicy = .alwaysWithBiometrics
    config.biometricsLocalizedReason = "Desbloquear el código de tu tarjeta Tangem"
    let sdk = TangemSdk(config: config)
    sdk.initializeJSONRPC(networkService: NetworkService(session: URLSession.shared, additionalHeaders: [:]))
    return sdk
  }()

  public func definition() -> ModuleDefinition {
    Name("TangemNfc")

    Function("isAvailable") { () -> Bool in
      return NFCNDEFReaderSession.readingAvailable
    }

    /// Borra los códigos de tarjetas Tangem guardados con Face ID en este teléfono.
    Function("clearSavedAccessCodes") { () -> Bool in
      AccessCodeRepository().clear()
      return true
    }

    /// request: JSON-RPC 2.0 como string. Devuelve la respuesta JSON-RPC como string.
    AsyncFunction("runJsonRpc") { (request: String, cardId: String?, initialMessage: String?, promise: Promise) in
      self.sdk.startSession(with: request, cardId: cardId, initialMessage: initialMessage, accessCode: nil) { response in
        promise.resolve(response)
      }
    }
    .runOnQueue(.main)
  }
}
