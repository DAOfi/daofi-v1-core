pragma solidity >=0.5.0;

library DAOfi {
    struct CurveParams {
        address baseToken;
        uint256 m;
        uint n;
        uint fee;
    }
}