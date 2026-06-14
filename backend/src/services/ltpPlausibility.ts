/** Reject WebSocket ticks that diverge from the latest Kite REST anchor. */

export function isPlausibleOptionLtp(

  previousLtp: number,

  nextLtp: number,

  restLtp?: number,

): boolean {

  if (!Number.isFinite(nextLtp) || nextLtp <= 0) {

    return false;

  }



  if (restLtp != null && restLtp > 0) {

    return Math.abs(nextLtp - restLtp) / restLtp <= 0.05;

  }



  if (previousLtp <= 0) {

    return true;

  }



  return Math.abs(nextLtp - previousLtp) / previousLtp <= 0.05;

}

