import { SessionRegistry } from './session-registry.service';

describe('SessionRegistry', () => {
  let registry: SessionRegistry;

  beforeEach(() => {
    registry = new SessionRegistry();
  });

  it('enregistre une caméra avec ses métadonnées', () => {
    const s = registry.register('sock1', 'cam-front', 'Entrée');
    expect(s.cameraId).toBe('cam-front');
    expect(s.label).toBe('Entrée');
    expect(registry.count()).toBe(1);
  });

  it('applique des valeurs par défaut sensées', () => {
    const s = registry.register('sock1', '', '');
    expect(s.cameraId).toBe('sock1');
    expect(s.label).toBe('Caméra sans nom');
  });

  it('liste les caméras par ordre de connexion', () => {
    registry.register('a', 'cam-a', 'A');
    registry.register('b', 'cam-b', 'B');
    expect(registry.list().map((s) => s.sessionId)).toEqual(['a', 'b']);
  });

  it('retire une caméra à la déconnexion', () => {
    registry.register('a', 'cam-a', 'A');
    registry.unregister('a');
    expect(registry.count()).toBe(0);
    expect(registry.get('a')).toBeUndefined();
  });
});
