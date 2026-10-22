package expo.modules.tangemnfc

import android.nfc.NfcAdapter
import androidx.fragment.app.FragmentActivity
import com.tangem.TangemSdk
import com.tangem.common.card.EllipticCurve
import com.tangem.common.core.Config
import com.tangem.common.services.secure.SecureStorage
import com.tangem.crypto.bip39.Wordlist
import com.tangem.crypto.hdWallet.DerivationPath
import com.tangem.sdk.DefaultSessionViewDelegate
import com.tangem.sdk.extensions.getWordlist
import com.tangem.sdk.extensions.initNfcManager
import com.tangem.sdk.nfc.AndroidNfcAvailabilityProvider
import com.tangem.sdk.nfc.NfcManager
import com.tangem.sdk.storage.create
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.lang.ref.WeakReference

/**
 * Puente mínimo hacia Tangem SDK (Android) por JSON-RPC.
 * Mismos métodos que en iOS: SCAN, SIGN_HASH, DERIVE_WALLET_PUBLIC_KEY.
 * La clave privada nunca sale de la tarjeta: solo viajan hashes, firmas y claves públicas.
 *
 * Igual que en iOS:
 * - al escanear deriva en la misma lectura la dirección XRP de la app Tangem (Wallet 2.0 /
 *   frase semilla, m/44'/144'/0'/0/0): llega en wallets[].derivedKeys;
 * - firmas secp256k1 canónicas (S bajo, lo exige el XRP Ledger): es el valor por defecto.
 * Diferencia con iOS (por ahora): el código de la tarjeta no se guarda con la huella; Tangem
 * lo pide en su propia ventana cada vez.
 *
 * Inicialización como en el módulo de Tangem que usa Xaman (tangem-sdk-react-native) y en
 * `TangemSdk.init` del propio SDK (versión fijada en android/build.gradle).
 */
class TangemNfcModule : Module() {
  private var sdk: TangemSdk? = null
  private var nfcManager: NfcManager? = null
  private var forActivity: WeakReference<FragmentActivity>? = null

  private fun config(): Config {
    val config = Config()
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
    val delegate = DefaultSessionViewDelegate(manager, activity)
    delegate.sdkConfig = config
    val created = TangemSdk(
      reader = manager.reader,
      viewDelegate = delegate,
      nfcAvailabilityProvider = AndroidNfcAvailabilityProvider(activity),
      secureStorage = secureStorage,
      wordlist = Wordlist.getWordlist(),
      config = config,
    )
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

    /** Sin códigos guardados en Android (ver arriba): no hay nada que borrar. */
    Function("clearSavedAccessCodes") {
      true
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
        } catch (e: Exception) {
          promise.reject(CodedException("TANGEM_ERROR", e.message ?: "Error de Tangem SDK", e))
        }
      }
    }

    OnActivityDestroys {
      sdk = null
      nfcManager = null
      forActivity = null
    }
  }
}
