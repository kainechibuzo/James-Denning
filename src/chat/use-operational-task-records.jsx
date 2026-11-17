import {useEffect,useMemo,useSyncExternalStore} from "react";
import {createTaskRecordController} from "./operational-task-records.mjs";

export function useOperationalTaskRecords({client,role,scopeKey,taskKey}) {
  const controller = useMemo(()=>createTaskRecordController(client,{role}),[client,role,scopeKey]);
  const state = useSyncExternalStore(controller.subscribe,controller.getSnapshot,controller.getSnapshot);
  useEffect(()=>{
    controller.activate();
    return ()=>controller.deactivate(); // Ignore late reads/writes across account/conversation changes.
  },[controller]);
  useEffect(()=>{void controller.setTaskIds(taskKey?taskKey.split(","):[]);},[controller,taskKey]);
  useEffect(()=>{
    if (!taskKey) return;
    const refreshVisible = () => {
      const current = controller.getSnapshot();
      if (document.visibilityState !== "visible" || current.phase === "loading" || current.pending.length || current.needsRefresh.length) return;
      void controller.refresh({background:true});
    };
    const interval = setInterval(refreshVisible, 30000);
    document.addEventListener("visibilitychange",refreshVisible);
    window.addEventListener("focus",refreshVisible);
    return ()=>{clearInterval(interval);document.removeEventListener("visibilitychange",refreshVisible);window.removeEventListener("focus",refreshVisible);};
  },[controller,taskKey]);
  return {state,refresh:controller.refresh,transition:controller.transition};
}
