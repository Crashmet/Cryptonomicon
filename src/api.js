const API_KEY =
  '8db07ad7d2ab9aa2239cce639d7af4b900b7a5e8c5fe2954f4429841192995d7';

const socket = new WebSocket(
  `wss://streamer.cryptocompare.com/v2?api_key=${API_KEY}`
);

const tickersHandlers = new Map();
const invalidSubsList = new Map();
const btcTickers = new Set();

const AGGREGATE_INDEX = '5';
const INVALID_SUB = 'INVALID_SUB';
const BTC_SYMBOL = 'BTC';
const USD_SYMBOL = 'USD';
let BTC_PRICE = 0;

socket.addEventListener('message', (e) => {
  const { MESSAGE: message, PARAMETER: nameSubs } = JSON.parse(e.data);

  if (message === INVALID_SUB) {
    const currency = nameSubs
      .split('~')
      .filter((n, i) => i == 2)
      .join('');

    if (BTC_PRICE === 0) {
      subscribeToTickerOnWs(BTC_SYMBOL, USD_SYMBOL);
    }

    subscribeToTickerOnWs(currency, BTC_SYMBOL);
    setStatus(currency, false);
  }
});

socket.addEventListener('message', (e) => {
  // когда придут сообщения
  const {
    TYPE: type,
    FROMSYMBOL: currency,
    PRICE: newPrice,
    TOSYMBOL: unit,
  } = JSON.parse(e.data);

  if (type !== AGGREGATE_INDEX || newPrice === undefined) {
    return;
  }

  if (unit === BTC_SYMBOL) {
    btcTickers.add(currency);
    const conversion = BTC_PRICE * newPrice;
    setPrice(currency, conversion);
    setStatus(currency, true);
    return;
  }

  if (currency === BTC_SYMBOL) {
    BTC_PRICE = newPrice;
  }

  setPrice(currency, newPrice);
  setStatus(currency, true);
});

function setPrice(currency, newPrice) {
  const handlers = tickersHandlers.get(currency) ?? [];
  handlers.forEach((fn) => {
    fn(newPrice);
  });
}

function setStatus(currency, status) {
  const handlers = invalidSubsList.get(currency) ?? [];
  handlers.forEach((fn) => {
    fn(status);
  });
}

function sendToWebSocket(message) {
  // если сокет открыт(опен), и отправить сообщение вебсокету, если сокет закрыт, дождаться и отправить

  const stringifiedMessage = JSON.stringify(message);

  if (socket.readyState === WebSocket.OPEN) {
    socket.send(stringifiedMessage);
    return;
  }

  socket.addEventListener(
    'open',
    () => {
      socket.send(stringifiedMessage);
    },
    { once: true }
  );
}

function subscribeToTickerOnWs(ticker, unit = USD_SYMBOL) {
  sendToWebSocket({
    action: 'SubAdd',
    subs: [`5~CCCAGG~${ticker}~${unit}`],
  });
}

function unsubscribeFromTickerOnWs(ticker, unit = USD_SYMBOL) {
  for (let btcTicker of btcTickers) {
    if (ticker === btcTicker) {
      sendToWebSocket({
        action: 'SubRemove',
        subs: [`5~CCCAGG~${ticker}~${BTC_PRICE}`],
      });
      btcTickers.delete(ticker);
      return;
    }
  }

  sendToWebSocket({
    action: 'SubRemove',
    subs: [`5~CCCAGG~${ticker}~${unit}`],
  });

  if (!tickersHandlers || tickersHandlers.size === 0) {
    sendToWebSocket({
      action: 'SubRemove',
      subs: [`5~CCCAGG~${BTC_SYMBOL}~${USD_SYMBOL}`],
    });
  }
}

// cb - добавление функции к тикеру которые будут вызываться
export const subscribeToTicker = (ticker, cb) => {
  // когда обновиться определенный тикер, вызови функцию солбэк
  const subscribers = tickersHandlers.get(ticker) || [];

  // subscribers - вытягиваем всех тех кто подписан на этот тикер; когда я подписываюсь на опрееделенный тикер, вызывай мне определенную функцию
  tickersHandlers.set(ticker, [...subscribers, cb]);
  // ...subscribers список функций я на который я был раньше подписан и сb новая функция
  subscribeToTickerOnWs(ticker);
};

export const unsubscribeFromTicker = (ticker) => {
  tickersHandlers.delete(ticker);
  unsubscribeFromTickerOnWs(ticker);
};

export const subscribeToStatusTicker = (ticker, cb) => {
  const subscribers = invalidSubsList.get(ticker) || [];
  invalidSubsList.set(ticker, [...subscribers, cb]);
};

export const unsubscribeFromStatusTicker = (ticker) => {
  invalidSubsList.delete(ticker);
};

export const getCoinlist = () =>
  // дз, метод then выполняет функцию на пришедшие данные от метода fetch
  fetch(
    `https://min-api.cryptocompare.com/data/all/coinlist?summary=true&api_key=${API_KEY}`
  ).then((result) => result.json());
// https://doka.guide/js/promise/#cepochki-metodov
