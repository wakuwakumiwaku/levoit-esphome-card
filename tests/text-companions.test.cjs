const assert = require('node:assert/strict');
const test = require('node:test');

const registry = new Map();
globalThis.customElements = { get: id => registry.get(id), define: (id, ctor) => registry.set(id, ctor) };
globalThis.window = {};
globalThis.HTMLElement = class {
  attachShadow() { this.shadowRoot = { querySelectorAll: () => [] }; }
};
require('../levoit-esphome-card.js');

const fan = 'fan.bedroom_fan';
function render(readings, overrides = {}) {
  const Card = customElements.get('levoit-esphome-card');
  const card = new Card();
  card.setConfig({ entity: fan, ...overrides });
  const values = { [fan]: 'on', 'number.bedroom_timer_min': '60', ...readings };
  card.hass = { states: Object.fromEntries(Object.entries(values).map(([id, state]) => [id, { state }])) };
  return card;
}

const native = {
  'sensor.bedroom_error': 'Motor stalled',
  'sensor.bedroom_timer_remaining': '42 min',
  'sensor.bedroom_model': 'Core 300S',
};
const legacy = {
  'text_sensor.bedroom_error': 'Filter jammed',
  'text_sensor.bedroom_timer_remaining': '12 min',
  'text_sensor.bedroom_model': 'Core 400S',
};

test('native ESPHome readings win over legacy entities', () => {
  const card = render({ ...legacy, ...native });
  assert.match(card.shadowRoot.innerHTML, /Purifier Error: Motor stalled/);
  assert.match(card.shadowRoot.innerHTML, /42 min/);
  assert.equal(card._resolveEntities(fan).model, 'sensor.bedroom_model');
});

test('text_sensor readings still work without native companions', () => {
  const card = render(legacy);
  assert.match(card.shadowRoot.innerHTML, /Purifier Error: Filter jammed/);
  assert.match(card.shadowRoot.innerHTML, /12 min/);
  assert.equal(card._resolveEntities(fan).model, 'text_sensor.bedroom_model');
});

test('configured IDs take precedence over discovery', () => {
  const overrides = {
    error_entity: 'sensor.custom_fault',
    timer_remaining_entity: 'sensor.custom_time',
    model_entity: 'sensor.custom_model',
  };
  const card = render({
    ...native,
    'sensor.custom_fault': 'Door open',
    'sensor.custom_time': '7 min',
    'sensor.custom_model': 'Core 200S',
  }, overrides);
  assert.match(card.shadowRoot.innerHTML, /Purifier Error: Door open/);
  assert.match(card.shadowRoot.innerHTML, /7 min/);
  assert.equal(card._resolveEntities(fan, overrides).model, 'sensor.custom_model');
});

test('another purifier sharing the prefix cannot supply missing readings', () => {
  const card = render({
    'fan.bedroom_guest_fan': 'on',
    'sensor.bedroom_guest_error': 'Motor stalled',
    'sensor.bedroom_guest_timer_remaining': '19 min',
    'sensor.bedroom_guest_model': 'Core 600S',
  });
  const { error, timerRemaining, model } = card._resolveEntities(fan);
  assert.deepEqual([error, timerRemaining, model], [null, null, null]);
  assert.doesNotMatch(card.shadowRoot.innerHTML, /Purifier Error:/);
  assert.match(card.shadowRoot.innerHTML, /60m/);
});
