import { beforeEach, describe, expect, it } from 'vitest';
import { profileStore } from '../profile';
import {
  buildAniListAuthorizeUrl,
  buildMalAuthorizeUrl,
  extractUsername,
  generatePkceVerifier,
} from '../trackers';

describe('OAuth helpers & custom profile shelves', () => {
  beforeEach(() => {
    localStorage.clear();
    profileStore.reset();
  });

  it('extracts usernames cleanly from handles and URLs', () => {
    expect(extractUsername('https://anilist.co/user/HarshTheOtaku')).toBe('HarshTheOtaku');
    expect(extractUsername('https://myanimelist.net/profile/Nekomata_1')).toBe('Nekomata_1');
    expect(extractUsername('@listtube_user')).toBe('listtube_user');
  });

  it('builds valid AniList and MAL OAuth authorization URLs with exact redirect URI', () => {
    const alCodeUrl = buildAniListAuthorizeUrl({
      clientId: '57274',
      redirectUri: 'https://listtube.vercel.app/',
      useImplicit: false,
      state: 'anilist:abc',
    });
    expect(alCodeUrl).toContain('client_id=57274');
    expect(alCodeUrl).toContain('response_type=code');
    expect(alCodeUrl).toContain(encodeURIComponent('https://listtube.vercel.app/'));

    const verifier = generatePkceVerifier(64);
    expect(verifier.length).toBe(64);
    const malUrl = buildMalAuthorizeUrl({
      clientId: 'f74fba547b6b04cdb063b1ef1bfc76a3',
      redirectUri: 'https://listtube.vercel.app/',
      codeChallenge: verifier,
      state: 'mal:xyz',
    });
    expect(malUrl).toContain('code_challenge_method=plain');
    expect(malUrl).toContain(encodeURIComponent('https://listtube.vercel.app/'));
  });

  it('adds and deduplicates custom shelf names on profileStore', () => {
    const created = profileStore.addCustomListName('Cozy Rewatch');
    expect(created).toBe('Cozy Rewatch');
    profileStore.addCustomListName('cozy rewatch');
    const names = profileStore.getSnapshot().customListNames ?? [];
    expect(names.filter((n) => n.toLowerCase() === 'cozy rewatch').length).toBe(1);
    profileStore.removeCustomListName('Cozy Rewatch');
    expect(profileStore.getSnapshot().customListNames).not.toContain('Cozy Rewatch');
  });
});
