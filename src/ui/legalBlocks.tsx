import React from 'react';
import { View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Card, Txt } from './components';
import { C, SP } from './theme';
import { NEVER_ASK, RESPONSIBILITY } from '../legal';

/** "Quorum nunca te pedirá…": para reconocer estafas. */
export function NeverAskCard() {
  return (
    <Card style={{ borderColor: C.bad + '66', backgroundColor: C.badBg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: SP.sm }}>
        <Feather name="shield-off" size={20} color={C.bad} />
        <Txt v="h3">Quorum nunca te va a…</Txt>
      </View>
      {NEVER_ASK.map((t) => (
        <View key={t} style={{ flexDirection: 'row', gap: 10, paddingVertical: 4 }}>
          <Feather name="x" size={15} color={C.bad} style={{ marginTop: 3 }} />
          <Txt v="small" color={C.text} style={{ flex: 1 }}>
            {t}
          </Txt>
        </View>
      ))}
      <Txt v="small" style={{ marginTop: SP.sm }}>
        Si alguien te pide algo de esto en nombre de Quorum, es una estafa. Las operaciones solo nacen dentro de la app, y las firmas solo ocurren en tus dispositivos.
      </Txt>
    </Card>
  );
}

/** Puntos del aviso de responsabilidad. */
export function ResponsibilityList() {
  return (
    <View>
      {RESPONSIBILITY.map((p) => (
        <View key={p.title} style={{ flexDirection: 'row', gap: SP.md, paddingVertical: 10 }}>
          <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: C.warnBg, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name={p.icon} size={18} color={C.warn} />
          </View>
          <View style={{ flex: 1 }}>
            <Txt v="h3">{p.title}</Txt>
            <Txt v="small">{p.text}</Txt>
          </View>
        </View>
      ))}
    </View>
  );
}
