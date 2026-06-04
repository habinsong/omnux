import { registerDesktopRequestTypes, sendDesktopRequest } from "./desktop-message-gateway";

// 운영/Doctor WS 요청. Doctor fix apply는 Phase 5 운영 위험 명령이라 UI에서는 preview만 연결한다.
registerDesktopRequestTypes(
  "doctor_get_last",
  "doctor_run",
  "doctor_fix_preview",
  "plan_list",
  "task_graph_list"
);

export const requestDesktopOps = {
  doctorLast() {
    return sendDesktopRequest({ type: "doctor_get_last" });
  },
  doctorRun() {
    return sendDesktopRequest({ type: "doctor_run" });
  },
  doctorFixPreview() {
    return sendDesktopRequest({ type: "doctor_fix_preview" });
  },
  planList() {
    return sendDesktopRequest({ type: "plan_list" });
  },
  taskGraphList() {
    return sendDesktopRequest({ type: "task_graph_list" });
  }
};
