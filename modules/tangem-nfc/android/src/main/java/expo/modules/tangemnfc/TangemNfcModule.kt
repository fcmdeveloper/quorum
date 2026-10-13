package expo.modules.tangemnfc

import android.nfc.NfcAdapter
import com.tangem.TangemSdk
import com.tangem.common.core.Config
import com.tangem.common.services.secure.SecureStorage
import com.tangem.tangem_sdk_new.DefaultSessionViewDelegate
import com.tangem.tangem_sdk_new.nfc.NfcManager
import com.tangem.tangem_sdk_new.storage.create
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Puente mínimo hacia Tangem SDK (Android) por JSON-RPC.
 * Mismos métodos que en iOS: SCAN, SIGN_HASH, DERIVE_WALLET_PUBLIC_KEY.
 */
class TangemNfcModule : Module() {
  private var nfcManager: NfcManager? = null
  private var sdk: TangemSdk? = null

  private fun ensureSdk(): TangemSdk {
    sdk?.let { return it }
    val activity = appContext.currentActivity
      ?: throw CodedException("NO_ACTIVITY", "No hay actividad activa para NFC", null)
    val manager = NfcManager().apply { setCurrentActivity(activity) }
    val delegate = DefaultSessionViewDelegate(manager, manager.reader, activity)
    val storage = SecureStorage.create(activity)
    val created = TangemSdk(manager.reader, delegate, storage, Config())
    manager.onStart()
    nfcManager = manager
    sdk = created
    return created
  }

  override fun definition() = ModuleDefinition {
    Name("TangemNfc")

    Function("isAvailable") {
      val ctx = appContext.reactContext ?: return@Function false
      val adapter = NfcAdapter.getDefaultAdapter(ctx)
      adapter != null && adapter.isEnabled
    }

    AsyncFunction("runJsonRpc") { request: String, cardId: String?, initialMessage: String?, promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.reject(CodedException("NO_ACTIVITY", "No hay actividad activa para NFC", null))
        return@AsyncFunction
      }
      activity.runOnUiThread {
        try {
          ensureSdk().startSessionWithJsonRequest(request, cardId, initialMessage) { response ->
            activity.runOnUiThread { promise.resolve(response) }
          }
        } catch (e: Exception) {
          promise.reject(CodedException("TANGEM_ERROR", e.message ?: "Error de Tangem SDK", e))
        }
      }
    }

    OnActivityEntersForeground {
      nfcManager?.onStart()
    }

    OnActivityEntersBackground {
      nfcManager?.onStop()
    }

    OnActivityDestroys {
      nfcManager?.onDestroy()
      nfcManager = null
      sdk = null
    }
  }
}
