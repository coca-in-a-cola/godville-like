import { GEAR_BAG_CAPACITY, GEAR_SLOTS, renderItemName, perceivedPower, type GearItem, type SessionState } from '@godville/sim';
import { gameData, translator as t } from '../gameData.ts';
import { n, contentName } from '../viewFormat.ts';
import type { Act } from '../gameView.tsx';
interface ItemProps { session: SessionState; act: Act; disabled: boolean; compact: boolean }
function Power({ item, s }: { item: GearItem; s: SessionState }) {
  return <span class="item-power num">{t.t('ui.truePower', { power: n(item.power) })} · {t.t('ui.perceivedPower', { power: n(perceivedPower(item, s.world.hero)) })}{item.godBlessed && ` · ${t.t('ui.locked')}`}</span>;
}
function BlessButton({ item, session: s, act, disabled }: Omit<ItemProps, 'compact'> & { item: GearItem }) {
  const inv = s.world.hero.inventory;
  const hasBlessed = [...inv.bag, ...Object.values(inv.equipped)].some((i) => i?.godBlessed);
  const blocked = disabled || s.world.god.gp < 5 || s.world.phase === 'combat' || s.world.phase === 'dead';
  return item.godBlessed
    ? <button class="bless" disabled={blocked} onClick={() => void act({ type: 'unbless_item', itemId: item.id })}>{t.t('ui.unblessItem')}</button>
    : <button class="bless" disabled={blocked || hasBlessed} onClick={() => void act({ type: 'bless_item', itemId: item.id })}>{t.t('ui.blessItem')}</button>;
}
function ItemView({ item, session: s, act, disabled, compact }: ItemProps & { item: GearItem }) {
  return <details class={`item rarity-${item.rarity}`}><summary>{renderItemName(gameData, item, compact)}<Power item={item} s={s} /></summary><div class="item-detail"><p>{renderItemName(gameData, item)}</p><p class="num">{t.t('ui.itemPrice', { level: item.level, price: n(item.price), sell: n(item.sellPrice), shop: n(item.shopPrice) })}</p><dl class="facts">{Object.entries(item.stats).filter(([,v]) => v !== 0).map(([key,value]) => <><dt>{t.t(`stat.${key}`)}</dt><dd class="num">{n(value)}</dd></>)}</dl><p class="hint">{t.t('ui.itemBlessHint')}</p><BlessButton item={item} session={s} act={act} disabled={disabled} /></div></details>;
}
export function EquipmentCard(props: ItemProps) {
  const inv = props.session.world.hero.inventory;
  return <section class="card equipment-card"><h2 class="card-title">{t.t('ui.equipmentTitle')}</h2><p class="hint">{t.t('ui.autoequip')}</p>
    <ul class="slots">{GEAR_SLOTS.map(slot => { const item = inv.equipped[slot]; return <li class="slot" key={slot}><span class="slot-label">{t.t(`slot.${slot}`)}</span>{item ? <ItemView {...props} item={item} /> : <span class="hint">{t.t('ui.empty')}</span>}</li>; })}</ul>
  </section>;
}
export function BagCard({ onCompact, ...props }: ItemProps & { onCompact: (value: boolean) => void }) {
  const inv = props.session.world.hero.inventory;
  const bag = [...inv.bag].sort((a, b) => b.power - a.power);
  return <section class="card bag-card"><h2 class="card-title">{t.t('ui.bagTitle')} <span class="num">{t.t('ui.bag', { count: inv.bag.length })}</span></h2>
    <label class="compact"><input type="checkbox" checked={props.compact} onChange={event => onCompact(event.currentTarget.checked)} />{t.t('ui.compact')}</label>
    <ol class="bag-slots">{Array.from({ length: GEAR_BAG_CAPACITY }, (_, index) => { const item = bag[index]; return <li class={item ? 'bag-slot' : 'bag-slot empty'} key={item?.id ?? `empty-${index}`}>{item ? <><ItemView {...props} item={item} /><BlessButton item={item} {...props} /></> : <span class="hint">{t.t('ui.emptySlot')}</span>}</li>; })}</ol>
    <h3>{t.t('ui.trophies', { count: inv.trophies.length })}</h3><ul class="trophies">{inv.trophies.map(item => <li key={item.id}>{contentName('trophies', item.contentId)} <span class="num">{t.t('ui.trophyPrice', { price: n(item.price * 0.3) })}</span></li>)}</ul>{!inv.trophies.length && <p class="hint">{t.t('ui.emptyPouch')}</p>}
  </section>;
}
