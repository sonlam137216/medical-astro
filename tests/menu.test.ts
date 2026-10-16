import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb } from '../src/lib/db.ts';
import { groupMenu, isMenuGroup, menuGroupError, withServicesMenu } from '../src/lib/menu.ts';
import { buildSnapshot } from '../src/lib/snapshot.ts';
import { failure, testDb } from './helpers/sqlite.ts';

test('links with the same drop-down name are gathered at the place of the first one', () => {
  const menu = groupMenu([
    { label: 'Home', href: '/' },
    { label: 'Dental Travel Guide', href: '/travel-guide', group: 'Guides' },
    { label: 'Services', href: '/services', group: null },
    { label: 'Dental Knowledge', href: '/dental-knowledge', group: ' guides ' },
    { label: 'Contact', href: '#consultation', group: '' },
  ]);
  assert.deepEqual(menu, [
    { label: 'Home', href: '/' },
    {
      label: 'Guides',
      links: [
        { label: 'Dental Travel Guide', href: '/travel-guide' },
        { label: 'Dental Knowledge', href: '/dental-knowledge' },
      ],
    },
    { label: 'Services', href: '/services' },
    { label: 'Contact', href: '#consultation' },
  ]);
  assert.equal(menu.filter(isMenuGroup).length, 1);
});

test('only main menu links can be in a drop-down', () => {
  assert.equal(menuGroupError({ location: 'header', menu_group: 'Guides' }), null);
  assert.equal(menuGroupError({ location: 'footer_explore', menu_group: null }), null);
  assert.match(
    menuGroupError({ location: 'footer_explore', menu_group: 'Guides' }) ?? '',
    /main menu/,
  );

  const { raw } = testDb();
  const insert =
    'INSERT INTO navigation_items (location, label, href, menu_group) VALUES (?, ?, ?, ?)';
  assert.equal(failure(raw, insert, 'header', 'Guide', '/travel-guide', 'Guides'), '');
  assert.match(failure(raw, insert, 'footer_explore', 'Guide', '/travel-guide', 'Guides'), /CHECK/);
  assert.match(failure(raw, insert, 'header', 'Guide', '/travel-guide', ''), /CHECK/);
  assert.match(failure(raw, insert, 'header', 'Guide', '/travel-guide', 'x'.repeat(41)), /CHECK/);
});

test('the snapshot carries the drop-down name only for links that have one', async () => {
  const { raw, sql } = testDb();
  const insert = raw.prepare(
    'INSERT INTO navigation_items (location, label, href, sort_order, menu_group) VALUES (?, ?, ?, ?, ?)',
  );
  insert.run('header', 'Home', '/', 1, null);
  insert.run('header', 'Dental Knowledge', '/dental-knowledge', 2, 'Guides');
  const snapshot = await buildSnapshot(createDb(sql, { actorId: null, audit: false }));
  assert.deepEqual(snapshot.navigation, [
    { location: 'header', label: 'Home', href: '/' },
    { location: 'header', label: 'Dental Knowledge', href: '/dental-knowledge', group: 'Guides' },
  ]);
});

test('the Services link opens a drop-down of the services and still links to the Services page', () => {
  const services = [
    { label: 'Dental Implants', href: '/services/dental-implants' },
    { label: 'Orthodontics', href: '/services/orthodontics' },
  ];
  const guides = {
    label: 'Guides',
    links: [{ label: 'Dental Knowledge', href: '/dental-knowledge' }],
  };
  const menu = withServicesMenu(
    [{ label: 'Home', href: '/' }, { label: 'Our services', href: '/services/' }, guides],
    services,
  );
  assert.deepEqual(menu, [
    { label: 'Home', href: '/' },
    { label: 'Our services', href: '/services/', links: services },
    guides,
  ]);
  // No services: a plain link. A Services link put in a drop-down by the admin is left as it is.
  assert.deepEqual(withServicesMenu([{ label: 'Services', href: '/services' }], []), [
    { label: 'Services', href: '/services' },
  ]);
  const grouped = [{ label: 'More', links: [{ label: 'Services', href: '/services' }] }];
  assert.deepEqual(withServicesMenu(grouped, services), grouped);
});
