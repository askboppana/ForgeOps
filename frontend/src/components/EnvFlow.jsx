import { Check } from 'lucide-react';
import { ALL_ENVS } from '../data/envProfiles';

export default function EnvFlow({ profile, currentEnv }) {
  if (!profile) return null;
  const envs = profile.environments;

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {ALL_ENVS.map((env, i) => {
        const inProfile = envs.includes(env);
        const currentIdx = envs.indexOf(currentEnv);
        const envIdx = envs.indexOf(env);

        if (!inProfile) {
          return (
            <div key={env} className="flex items-center gap-1">
              {i > 0 && <span className="text-xs" style={{ color: 'var(--text-tertiary)', opacity: 0.3 }}>—</span>}
              <span
                className="px-2 py-0.5 rounded text-xs line-through"
                style={{ color: 'var(--text-tertiary)', opacity: 0.35 }}
              >
                {env}
              </span>
            </div>
          );
        }

        const isPast = currentEnv && envIdx < currentIdx;
        const isCurrent = env === currentEnv;
        const isFuture = !currentEnv || envIdx > currentIdx;

        let bg = 'var(--bg-secondary)';
        let color = 'var(--text-tertiary)';
        let border = '1px solid var(--border)';

        if (isPast) {
          bg = 'rgba(63,185,80,0.12)';
          color = 'var(--success)';
          border = '1px solid rgba(63,185,80,0.3)';
        } else if (isCurrent) {
          bg = 'rgba(210,153,34,0.12)';
          color = 'var(--warning)';
          border = '1.5px dashed var(--warning)';
        }

        return (
          <div key={env} className="flex items-center gap-1">
            {i > 0 && ALL_ENVS.slice(0, i).some(e => envs.includes(e)) && (
              <span className="text-xs" style={{ color: inProfile ? 'var(--text-tertiary)' : 'var(--text-tertiary)', opacity: inProfile ? 0.5 : 0.2 }}>→</span>
            )}
            <span
              className="px-2 py-0.5 rounded text-xs font-medium flex items-center gap-1"
              style={{ background: bg, color, border }}
            >
              {isPast && <Check size={10} />}
              {env}
              {isCurrent && <span className="text-[9px] opacity-70 ml-0.5">current</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}
