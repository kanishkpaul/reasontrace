import { useShallow } from "zustand/react/shallow";
import { EVENT_TYPE_ORDER, EVENT_TYPES } from "../lib/eventTypes";
import { ICON, SearchIcon } from "../lib/icons";
import { useTraceStore } from "../store";

/** Search and type filters for the open trace, and the graph's display options. */
export function EventFilters() {
  const s = useTraceStore(useShallow((state) => ({
    filters: state.filters,
    settings: state.settings,
    setEventTypeFilter: state.setEventTypeFilter,
    setSearchQuery: state.setSearchQuery,
    toggleSetting: state.toggleSetting,
    resetFilters: state.resetFilters,
  })));

  return (
    <section className="filters">
      <div className="filters__head">
        <h2 className="section-heading">Filter</h2>
        <button type="button" className="btn btn--text btn--xs" onClick={s.resetFilters}>Reset</button>
      </div>
      <label className="search">
        <SearchIcon size={ICON.size} stroke={ICON.stroke} />
        <input
          type="search"
          aria-label="Search events"
          placeholder="Search content, tools, types"
          value={s.filters.searchQuery}
          onChange={(e) => s.setSearchQuery(e.target.value)}
        />
      </label>
      {EVENT_TYPE_ORDER.map((type) => (
        <label key={type} className="row filters__toggle">
          <span className="row__title">{EVENT_TYPES[type].label}</span>
          <input
            type="checkbox"
            className="switch"
            checked={s.filters.eventTypes[type]}
            onChange={(e) => s.setEventTypeFilter(type, e.target.checked)}
          />
        </label>
      ))}
      <h2 className="section-heading">Graph</h2>
      <label className="row filters__toggle">
        <span className="row__title">Show time order as dashed edges</span>
        <input type="checkbox" className="switch" checked={s.settings.showTemporalEdges} onChange={() => s.toggleSetting("showTemporalEdges")} />
      </label>
      <label className="row filters__toggle">
        <span className="row__title">Mark failures</span>
        <input type="checkbox" className="switch" checked={s.settings.highlightFailures} onChange={() => s.toggleSetting("highlightFailures")} />
      </label>
    </section>
  );
}
