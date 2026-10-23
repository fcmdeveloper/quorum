package expo.modules.tangemnfc

import android.nfc.NfcAdapter
import androidx.fragment.app.FragmentActivity
import com.tangem.TangemSdk
import com.tangem.common.CompletionResult
import com.tangem.common.UserCodeType
import com.tangem.common.authentication.keystore.KeystoreManager
import com.tangem.common.core.UserCodeRequestPolicy
import com.tangem.common.services.secure.AccessCodeRepository
import com.tangem.common.card.EllipticCurve
import com.tangem.common.core.Config
import com.tangem.common.services.secure.SecureStorage
import com.tangem.crypto.bip39.Wordlist
import com.tangem.crypto.hdWallet.DerivationPath
import com.tangem.operations.attestation.AttestationTask
import com.tangem.sdk.DefaultSessionViewDelegate
import com.tangem.sdk.extensions.getWordlist
import com.tangem.sdk.extensions.initAuthenticationManager
import com.tangem.sdk.extensions.initKeystoreManager
import com.tangem.sdk.extensions.initNfcManager
import com.tangem.sdk.nfc.AndroidNfcAvailabilityProvider
import com.tangem.sdk.nfc.NfcManager
import com.tangem.sdk.storage.create
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.lang.ref.WeakReference
import kotlinx.coroutines.runBlocking

/**
 * Puente mínimo hacia Tangem SDK (Android) por JSON-RPC.
 * Mismos métodos que en iOS: SCAN, SIGN_HASH, DERIVE_WALLET_PUBLIC_KEY.
 * La clave privada nunca sale de la tarjeta: solo viajan hashes, firmas y claves públicas.
 *
 * Igual que en iOS:
 * - al escanear deriva en la misma lectura la dirección XRP de la app Tangem (Wallet 2.0 /
 *   frase semilla, m/44'/144'/0'/0/0): llega en wallets[].derivedKeys;
 * - firmas secp256k1 canónicas (S bajo, lo exige el XRP Ledger): es el valor por defecto.
 * - código de acceso: la primera vez se escribe y queda guardado en este teléfono, cifrado con una
 *   llave del almacén de llaves de Android que solo se abre con la huella (o el desbloqueo
 *   biométrico del teléfono). Las siguientes veces basta con la huella. Si el teléfono no tiene
 *   biometría configurada, Tangem pide el código cada vez.
 * - autenticidad de la tarjeta: se confirma con Tangem una vez por tarjeta (ver config()).
 *
 * Inicialización como en el módulo de Tangem que usa Xaman (tangem-sdk-react-native) y en
 * `TangemSdk.init` del propio SDK (versión fijada en android/build.gradle).
 */
class TangemNfcModule : Module() {
  private var sdk: TangemSdk? = null
  private var nfcManager: NfcManager? = null
  private var forActivity: WeakReference<FragmentActivity>? = null
  private var keystoreManager: KeystoreManager? = null
  private var secureStorage: SecureStorage? = null

  private fun config(): Config {
    val config = Config()
    // Autenticidad de la tarjeta, como en iOS: la tarjeta firma un desafío con su llave y, una vez
    // por tarjeta en este teléfono, se confirma con Tangem que la fabricaron ellos (solo el ID y la
    // llave de la tarjeta; nunca las llaves ni direcciones de las billeteras). Así se detecta una
    // tarjeta falsificada. El SDK de Android no trae la dirección del servicio: es la misma de iOS.
    config.attestationMode = AttestationTask.Mode.Normal
    config.tangemApiBaseUrl = "https://api.tangem.org/"
    // como en iOS (.alwaysWithBiometrics): el código queda guardado con la huella
    config.userCodeRequestPolicy = UserCodeRequestPolicy.AlwaysWithBiometrics(UserCodeType.AccessCode)
    val xrp = DerivationPath(rawPath = "m/44'/144'/0'/0/0")
    config.defaultDerivationPaths = mutableMapOf(EllipticCurve.Secp256k1 to listOf(xrp))
    return config
  }

  /** El SDK queda atado a una actividad: si Android la recreó (p. ej. al volver), se crea de nuevo. */
  private fun ensureSdk(activity: FragmentActivity): TangemSdk {
    val same = forActivity?.get() === activity && !activity.isDestroyed && !activity.isFinishing
    sdk?.let { if (same) return it }
    val config = config()
    val secureStorage = SecureStorage.create(activity)
    val manager = TangemSdk.initNfcManager(activity) // sigue el ciclo de vida de la actividad
    val authenticationManager = TangemSdk.initAuthenticationManager(activity)
    val keystore = TangemSdk.initKeystoreManager(authenticationManager, secureStorage)
    val delegate = DefaultSessionViewDelegate(manager, activity)
    delegate.sdkConfig = config
    val created = TangemSdk(
      reader = manager.reader,
      viewDelegate = delegate,
      nfcAvailabilityProvider = AndroidNfcAvailabilityProvider(activity),
      secureStorage = secureStorage,
      wordlist = Wordlist.getWordlist(),
      config = config,
      authenticationManager = authenticationManager,
      keystoreManager = keystore,
    )
    keystoreManager = keystore
    this.secureStorage = secureStorage
    nfcManager = manager
    sdk = created
    forActivity = WeakReference(activity)
    return created
  }

  override fun definition() = ModuleDefinition {
    Name("TangemNfc")

    Function("isAvailable") {
      val ctx = appContext.reactContext ?: return@Function false
      val adapter = NfcAdapter.getDefaultAdapter(ctx)
      adapter != null && adapter.isEnabled
    }

    /** Borra los códigos de tarjetas Tangem guardados con la huella en este teléfono. */
    Function("clearSavedAccessCodes") {
      val activity = appContext.currentActivity as? FragmentActivity ?: return@Function false
      try {
        ensureSdk(activity)
        val repo = AccessCodeRepository(keystoreManager ?: return@Function false, secureStorage ?: return@Function false)
        val had = runBlocking { repo.hasSavedUserCodes() }
        runBlocking { repo.clear() } is CompletionResult.Success && had
      } catch (e: Throwable) {
        android.util.Log.e("QuorumTangem", "clearSavedAccessCodes", e)
        false
      }
    }

    /** request: JSON-RPC 2.0 como string. Devuelve la respuesta JSON-RPC como string. */
    AsyncFunction("runJsonRpc") { request: String, cardId: String?, initialMessage: String?, promise: Promise ->
      val activity = appContext.currentActivity as? FragmentActivity
      if (activity == null) {
        promise.reject(CodedException("NO_ACTIVITY", "No hay actividad activa para NFC", null))
        return@AsyncFunction
      }
      activity.runOnUiThread {
        try {
          // sin código de acceso: lo pide la ventana de Tangem
          ensureSdk(activity).startSessionWithJsonRequest(request, cardId, initialMessage) { response ->
            activity.runOnUiThread { promise.resolve(response) }
          }
        } catch (e: Throwable) {
          // la causa real suele venir anidada (p. ej. al dibujar una ventana): se muestra completa
          android.util.Log.e("QuorumTangem", "runJsonRpc", e)
          val chain = generateSequence(e) { it.cause }.take(6).joinToString(" ← ") { "${it.javaClass.simpleName}: ${it.message}" }
          promise.reject(CodedException("TANGEM_ERROR", chain, e))
        }
      }
    }

    OnActivityDestroys {
      sdk = null
      nfcManager = null
      forActivity = null
      keystoreManager = null
      secureStorage = null
    }
  }
}
