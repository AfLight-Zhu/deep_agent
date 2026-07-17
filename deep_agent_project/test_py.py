
tuple_data = (1,2,3,4)
list_data = [1,2,3,4]

map_t = map(str,tuple_data)
map_l = map(str,list_data)
print(",".join(map_t))
print(",".join(map_l))