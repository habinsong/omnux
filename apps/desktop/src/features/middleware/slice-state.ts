/* ============================================================================
   지연 조회 구역의 상태(순수 모듈, 공용).

   한 화면이 서로 다른 조회를 여러 개 쓸 때, 그 조회들이 하나의 loading·lastError 를
   공유하면 **하나가 실패해도 화면 전체가 완료로 보인다.** 실패한 구역은 아직 부르지
   않은 구역과 구분되지 않는다. 로그 화면에서 실제로 그랬다.

   여기서는 구역마다 자기 상태를 갖는다. 실패해도 이전 결과 시각을 지우지 않아
   화면이 "언제 기준의 값인지" 계속 말할 수 있다.

   React 나 저장소를 가져오지 않는다. 이 파일만 따로 실행해 검사할 수 있다.
   ============================================================================ */

export type SliceStatus = "idle" | "loading" | "ready" | "failed";

export type SliceState = {
  status: SliceStatus;
  /** 실패 사유. status 가 failed 일 때만 채운다. */
  error: string;
  /** 결과를 받은 시각(ISO). 실패해도 지우지 않는다. */
  updatedAt: string;
};

export const IDLE_SLICE: SliceState = { status: "idle", error: "", updatedAt: "" };

export type SliceMapOf<Id extends string> = Record<Id, SliceState>;

export function createSliceMapFor<Id extends string>(ids: readonly Id[]): SliceMapOf<Id> {
  const map = {} as SliceMapOf<Id>;
  for (const id of ids) map[id] = IDLE_SLICE;
  return map;
}

export function markSliceLoading<Id extends string>(map: SliceMapOf<Id>, id: Id): SliceMapOf<Id> {
  return { ...map, [id]: { status: "loading", error: "", updatedAt: map[id].updatedAt } };
}

export function markSliceReady<Id extends string>(
  map: SliceMapOf<Id>,
  id: Id,
  updatedAt: string
): SliceMapOf<Id> {
  return { ...map, [id]: { status: "ready", error: "", updatedAt } };
}

/** 실패해도 이전 결과 시각은 남긴다. */
export function markSliceFailed<Id extends string>(
  map: SliceMapOf<Id>,
  id: Id,
  error: string
): SliceMapOf<Id> {
  return {
    ...map,
    [id]: { status: "failed", error: error || "조회에 실패했습니다.", updatedAt: map[id].updatedAt }
  };
}

/** 접힌 머리에 적는 상태 문구. 네 상태를 각각 구분한다. */
export function describeSlice(state: SliceState): string {
  if (state.status === "loading") return "조회 중";
  if (state.status === "failed") return "조회 실패";
  if (state.status === "ready") return "완료";
  return "열면 조회";
}

/** 실패한 구역 수. 요약을 접힌 곳에만 숨기지 않기 위해 화면 위쪽에서 쓴다. */
export function countFailed<Id extends string>(map: SliceMapOf<Id>, ids: readonly Id[]): number {
  let count = 0;
  for (const id of ids) {
    if (map[id]?.status === "failed") count += 1;
  }
  return count;
}

/**
 * 응답이 오지 않는 경우를 실패로 바꾸는 기한(밀리초).
 * 게이트웨이 오류에는 어느 요청인지 알려주는 값이 늘 붙지는 않는다.
 * 기한이 없으면 그 구역은 "조회 중"으로 영원히 남는다.
 */
export const SLICE_TIMEOUT_MS = 15_000;
