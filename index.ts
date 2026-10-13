// Polyfills necesarios para xrpl.js y las librerías de Ledger en React Native.
import 'react-native-get-random-values';
import { Buffer } from 'buffer';
(globalThis as any).Buffer = (globalThis as any).Buffer ?? Buffer;

import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);
