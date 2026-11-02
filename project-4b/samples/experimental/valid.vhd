library ieee;
use ieee.std_logic_1164.all;

entity p4b_sample is
    port (a : in std_logic; b : in std_logic; y : out std_logic);
end entity p4b_sample;

architecture rtl of p4b_sample is
begin
    y <= a and b;
end architecture rtl;
