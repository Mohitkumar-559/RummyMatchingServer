import { ContestData, GamePriority } from "domain/entities/contestRoom/contestRoom.dto"
import ContestRoomRepo from "domain/entities/contestRoom/contestRoom.repo"

const PRIORITY_TYPE = {
    USER: 1,
    XFAC: 2
}
export async function getGameConfig(contest: ContestData) {
    try {
        if(!contest.IsXFac){
            return GamePriority.XFAC_OFF;
        }
        let input = await ContestRoomRepo.Instance.getPriorityTimeFrameV2(contest.cid);
        console.log(input)
        if (input.IsUserActive && input.IsXFacUserActive && input.FirstPriorityId == PRIORITY_TYPE.USER) {
            return GamePriority.USER_FIRST
        } else if (input.IsUserActive && input.IsXFacUserActive && input.FirstPriorityId == PRIORITY_TYPE.XFAC) {
            return GamePriority.XFAC_FIRST
        }
        else if (input.IsUserActive && !input.IsXFacUserActive) {
            return GamePriority.XFAC_OFF
        } else if (!input.IsUserActive && input.IsXFacUserActive) {
            return GamePriority.XFAC_FIRST
        }
    } catch (err) {
        console.log("Error in reading priority table", err)
        return GamePriority.XFAC_OFF
    }
}