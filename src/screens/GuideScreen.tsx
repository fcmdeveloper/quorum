import React from 'react';
import { Linking, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNav } from '../nav';
import { Button, Card, Notice, Screen, Section, Txt } from '../ui/components';
import { C, SP } from '../ui/theme';

/** Pasos numerados. */
function Steps({ items }: { items: string[] }) {
  return (
    <View>
      {items.map((t, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 12, paddingVertical: 6 }}>
          <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: C.greenGlow, alignItems: 'center', justifyContent: 'center' }}>
            <Txt v="small" color={C.green}>
              {i + 1}
            </Txt>
          </View>
          <Txt v="body" style={{ flex: 1 }}>
            {t}
          </Txt>
        </View>
      ))}
    </View>
  );
}

export const XAMAN_TESTNET_STEPS = [
  'En Xaman, ve a Configuración → Avanzado y activa “Modo desarrollador”. Vuelve atrás.',
  'En Inicio de Xaman, toca el botón de red arriba a la derecha.',
  'En la sección Testnet, elige “XRPL Testnet”.',
  'Si la cuenta no tiene saldo en testnet, toca “Activar cuenta”: recibe 1.000 XRP de prueba.',
  'Vuelve a Quorum y firma. Al terminar los ensayos, vuelve a “XRPL Mainnet” desde el mismo botón.',
];

/** Guía del ensayo en testnet antes de crear la bóveda real. */
export default function GuideScreen() {
  const nav = useNav();
  return (
    <Screen title="Guía de ensayo" onBack={nav.pop}>
      <Txt v="body" color={C.dim} style={{ marginBottom: SP.lg }}>
        Testnet es una copia del XRP Ledger con XRP de prueba, sin valor. Haz ahí el recorrido completo de tu bóveda antes de hacerlo con fondos reales en mainnet.
      </Txt>

      <Section title="1 · Recorrido recomendado">
        <Card>
          <Steps
            items={[
              'Registra tus dispositivos en Quorum (Tangem, Ledger, Xaman).',
              'Crea una bóveda en red Testnet y envíale XRP de prueba para activarla.',
              'Configura la lista de firmantes y el quórum.',
              'Haz un envío de prueba con cada combinación de firmantes que podrías usar el día de mañana.',
              'Recién entonces desactiva la master key de la bóveda de prueba y repite un envío.',
              'Si todo funcionó, repite exactamente lo mismo en Mainnet.',
            ]}
          />
        </Card>
      </Section>

      <Section title="2 · Xaman en testnet">
        <Card>
          <Txt v="small" style={{ marginBottom: SP.sm }}>
            Si Xaman dice “Esta carga no está disponible en la red con la que estás conectado”, tienes que cambiar su red:
          </Txt>
          <Steps items={XAMAN_TESTNET_STEPS} />
        </Card>
      </Section>

      <Section title="3 · Tangem y Ledger en testnet">
        <Card>
          <Txt v="body">No hay que cambiar nada en la tarjeta ni en el Ledger.</Txt>
          <Txt v="small" style={{ marginTop: 6 }}>
            La misma dirección sirve en ambas redes; Quorum decide a qué red se envía. En Ledger usa la app XRP normal. La dirección debe estar activada en testnet (con XRP de prueba) para poder firmar operaciones de esa cuenta.
          </Txt>
        </Card>
      </Section>

      <Section title="4 · XRP de prueba">
        <Card>
          <Txt v="small">
            Para activar una dirección en testnet, envíale XRP de prueba desde una cuenta Xaman en testnet (que trae 1.000) o usa el faucet oficial del XRP Ledger.
          </Txt>
          <Button title="Abrir faucet de testnet" kind="ghost" icon="external-link" onPress={() => Linking.openURL('https://xrpl.org/resources/dev-tools/xrp-faucets')} />
        </Card>
      </Section>

      <Notice kind="info">
        Una misma dirección puede estar activa en testnet y en mainnet a la vez: son saldos independientes. Haberla usado antes en una red no afecta a la otra.
      </Notice>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', marginTop: SP.lg }}>
        <Feather name="shield" size={14} color={C.faint} />
        <Txt v="small">En mainnet los fondos son reales: no te saltes el ensayo.</Txt>
      </View>
    </Screen>
  );
}
