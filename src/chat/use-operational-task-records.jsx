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
  return {state,refresh:controller.refresh,transition:controller.transition};
}
