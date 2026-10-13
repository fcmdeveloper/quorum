import { useApp } from '../state';
import { formatFiat, formatXrp } from '../core/market';
import { NetworkId } from '../core/network';
import { Asset, knownToken } from '../core/assets';

/** Formato de montos respetando divisa elegida y "ocultar saldos". */
export function useMoney() {
  const { settings, price } = useApp();
  const hidden = settings.hideBalances;
  const p = price?.price[settings.fiat];
  return {
    fiat: settings.fiat,
    price: p,
    change: price?.change24h[settings.fiat],
    xrp: (v: string | number, net?: NetworkId) => (hidden ? '••••' : formatXrp(v)),
    /** Valor en divisa; en testnet no tiene valor real. */
    fiatOf: (v: string | number, net: NetworkId = 'mainnet') => {
      if (hidden) return '••••';
      if (net === 'testnet') return 'XRP de prueba';
      if (!p) return '—';
      return formatFiat(Number(v) * p, settings.fiat);
    },
    fiatRaw: (n: number) => (hidden ? '••••' : formatFiat(n, settings.fiat)),
    /** Valor en la divisa elegida de un monto de token; solo stablecoins conocidas (1 USD). */
    tokenFiatValue: (amount: number, asset: Asset, net: NetworkId): number | null => {
      if (net === 'testnet') return null;
      const k = knownToken(net, asset);
      if (!k?.usdPeg || !price?.price.usd || !p) return null;
      return amount * (p / price.price.usd);
    },
    /** Valor total de una cuenta en la divisa: XRP + stablecoins conocidas (null en testnet o sin precio). */
    accountFiatValue: (st: { balanceXrp: string | number; tokens: { balance: string; currency: string; issuer: string }[] }, net: NetworkId): number | null => {
      if (net === 'testnet' || !p) return null;
      let v = Number(st.balanceXrp) * p;
      for (const tk of st.tokens) {
        const k = knownToken(net, { currency: tk.currency, issuer: tk.issuer });
        if (k?.usdPeg && price?.price.usd) v += Number(tk.balance) * (p / price.price.usd);
      }
      return v;
    },
    tokenFiat: (amount: number, asset: Asset, net: NetworkId) => {
      if (hidden) return '••••';
      if (net === 'testnet') return 'de prueba';
      const k = knownToken(net, asset);
      if (!k?.usdPeg || !price?.price.usd || !p) return '';
      return formatFiat(amount * (p / price.price.usd), settings.fiat);
    },
  };
}
