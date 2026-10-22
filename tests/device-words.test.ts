import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setDeviceWords, setLang, t, tr } from '../src/i18n';

test('en Android, "Face ID" se dice "la huella" (en etiquetas y dentro de frases)', () => {
  setDeviceWords({
    es: [{ from: 'Face ID', exact: 'Huella', inline: 'la huella' }],
    en: [{ from: 'Face ID', exact: 'Fingerprint', inline: 'fingerprint' }],
  });
  try {
    setLang('es');
    assert.equal(t('Face ID'), 'Huella');
    assert.equal(t('Usar Face ID o el código del teléfono'), 'Usar la huella o el código del teléfono');
    assert.equal(tr('Usar Face ID o el código del teléfono'), 'Usar la huella o el código del teléfono');
    setLang('en');
    assert.match(t('Usar Face ID o el código del teléfono'), /fingerprint/);
    assert.doesNotMatch(t('Usar Face ID o el código del teléfono'), /Face ID/);
  } finally {
    setDeviceWords({ es: [], en: [] });
    setLang('es');
  }
  assert.equal(t('Face ID'), 'Face ID');
});
