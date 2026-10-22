package expo.modules.tangemnfc

import android.content.Context
import android.util.AttributeSet
import android.view.View
import android.view.autofill.AutofillValue
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputConnection
import com.google.android.material.textfield.TextInputEditText

/**
 * Campo del código de la tarjeta en la ventana de Tangem SDK. Reemplaza al
 * `NoAutofillTextInputEditText` del SDK, que en esta app falla al dibujarse: busca el estilo en
 * `com.google.android.material.R.attr.editTextStyle`, y ese campo no existe en la clase R de
 * Material que genera la app (NoSuchFieldError). Aquí se usa el atributo de AppCompat, que es
 * donde vive.
 *
 * Igual que el del SDK: fuera del autocompletado de Android (que si no ofrece contraseñas
 * guardadas en este campo) y sin que el teclado aprenda lo que se escribe.
 */
class CodeEditText @JvmOverloads constructor(
  context: Context,
  attrs: AttributeSet? = null,
  defStyleAttr: Int = androidx.appcompat.R.attr.editTextStyle,
) : TextInputEditText(context, attrs, defStyleAttr) {

  override fun getAutofillType(): Int = View.AUTOFILL_TYPE_NONE

  override fun autofill(value: AutofillValue) = Unit

  override fun onCreateInputConnection(outAttrs: EditorInfo): InputConnection? {
    val inputConnection = super.onCreateInputConnection(outAttrs)
    outAttrs.imeOptions = outAttrs.imeOptions or EditorInfo.IME_FLAG_NO_PERSONALIZED_LEARNING
    return inputConnection
  }
}
