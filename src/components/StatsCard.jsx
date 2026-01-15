import React from 'react';

export function StatsCard({ title, value, subtext, icon: Icon, trend, alert }) {
    return (
        <div className={`card relative ${alert ? 'border-l-4 border-l-rose-500' : ''}`}>
            <div className="flex justify-between items-start">
                <div>
                    <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>
                    <h3 className="text-2xl font-bold text-slate-800">{value}</h3>
                    {subtext && <p className="text-xs text-slate-400 mt-1">{subtext}</p>}
                    {trend ? (
                        <div className="mt-3 inline-flex items-center px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-bold">
                            {trend}
                        </div>
                    ) : null}
                </div>
                {Icon && (
                    <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                        <Icon size={20} />
                    </div>
                )}
            </div>
        </div>
    );
}
